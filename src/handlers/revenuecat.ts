import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesError,
  PurchasesStoreProduct,
  SubscriptionOption,
} from 'react-native-purchases';
import Purchases, { PRODUCT_CATEGORY, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { Platform } from 'react-native';
import type { HeliumPaywallEvent, HeliumPurchaseConfig, HeliumPurchaseResult } from '../types';
import { setRevenueCatAppUserId } from '../native-interface';

export interface RevenueCatConfig {
  /** RevenueCat API key (cross-platform). Only needed if RevenueCat is not already configured externally (e.g. via Purchases.configure). */
  apiKey?: string;
  /** iOS-specific RevenueCat API key. Takes precedence over `apiKey` on iOS. Only needed if RevenueCat is not already configured externally. */
  apiKeyIOS?: string;
  /** Android-specific RevenueCat API key. Takes precedence over `apiKey` on Android. Only needed if RevenueCat is not already configured externally. */
  apiKeyAndroid?: string;
  /** Set to true to disable automatic RevenueCat entitlement syncing after Stripe purchases. */
  disableStripePurchaseSync?: boolean;
  /** Set to true to disable automatic RevenueCat entitlement syncing after Paddle purchases. */
  disablePaddlePurchaseSync?: boolean;
}

export function createRevenueCatPurchaseConfig(config?: RevenueCatConfig): HeliumPurchaseConfig {
  const rcHandler = new RevenueCatHeliumHandler(config);
  return {
    makePurchaseIOS: rcHandler.makePurchaseIOS.bind(rcHandler),
    makePurchaseAndroid: rcHandler.makePurchaseAndroid.bind(rcHandler),
    restorePurchases: rcHandler.restorePurchases.bind(rcHandler),
    onHeliumEvent: rcHandler.onHeliumEvent.bind(rcHandler),
    _delegateType: 'h_revenuecat',
  };
}

// RC error codes worth retrying. These are transient failures that may resolve on a second attempt.
const RETRYABLE_RC_CODES = new Set([
  PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR,
  PURCHASES_ERROR_CODE.NETWORK_ERROR,
  PURCHASES_ERROR_CODE.MISSING_RECEIPT_FILE_ERROR,
  PURCHASES_ERROR_CODE.UNKNOWN_BACKEND_ERROR,
]);

type PurchaseAttemptResult = HeliumPurchaseResult & { shouldRetry?: boolean };

export class RevenueCatHeliumHandler {
  private stripePurchaseSyncDisabled: boolean = false;
  private paddlePurchaseSyncDisabled: boolean = false;
  private isSyncingThirdPartyPayment: boolean = false;
  private setUpPromise: Promise<void>;

  constructor(config?: RevenueCatConfig) {
    this.stripePurchaseSyncDisabled = config?.disableStripePurchaseSync ?? false;
    this.paddlePurchaseSyncDisabled = config?.disablePaddlePurchaseSync ?? false;

    // Determine which API key to use based on platform
    let effectiveApiKey: string | undefined;
    if (Platform.OS === 'ios' && config?.apiKeyIOS) {
      effectiveApiKey = config.apiKeyIOS;
    } else if (Platform.OS === 'android' && config?.apiKeyAndroid) {
      effectiveApiKey = config.apiKeyAndroid;
    } else {
      effectiveApiKey = config?.apiKey;
    }

    this.setUpPromise = this.setUp(effectiveApiKey);
  }

  private async setUp(apiKey?: string): Promise<void> {
    if (apiKey) {
      try {
        if (await Purchases.isConfigured()) {
          console.log(
            '[Helium] RevenueCat is already configured, ignoring provided RevenueCat api key.'
          );
        } else {
          Purchases.configure({ apiKey });
        }
      } catch {
        console.log('[Helium] Failed to configure RevenueCat.');
      }
    }
    // Keep this value as up-to-date as possible
    await this.syncRevenueCatAppUserId();
  }

  private async syncRevenueCatAppUserId(): Promise<void> {
    try {
      const id = await Purchases.getAppUserID();
      setRevenueCatAppUserId(id);
    } catch {
      console.log('[Helium] Could not sync RevenueCat app user ID.');
    }
  }

  async makePurchaseIOS(productId: string): Promise<HeliumPurchaseResult> {
    await this.setUpPromise;
    // Keep this value as up-to-date as possible
    await this.syncRevenueCatAppUserId();
    const result = await this.attemptPurchaseIOS(productId);

    if (this.isRetryableResult(result)) {
      await this.delay(1000);
      return this.attemptPurchaseIOS(productId);
    }
    return result;
  }

  private async attemptPurchaseIOS(productId: string): Promise<PurchaseAttemptResult> {
    let rcProduct: PurchasesStoreProduct | undefined;
    try {
      rcProduct = await this.getProduct(productId);
    } catch {
      return {
        status: 'failed',
        shouldRetry: true,
        error: `[RevenueCat] Failed to retrieve product: ${productId}`,
      };
    }

    if (!rcProduct) {
      return {
        status: 'failed',
        shouldRetry: true,
        error: `[RevenueCat] iOS product not found: ${productId}`,
      };
    }

    try {
      const purchaseResult = await Purchases.purchaseStoreProduct(rcProduct);
      const transactionId = purchaseResult.transaction?.transactionIdentifier;
      return this.evaluatePurchaseResult(purchaseResult.customerInfo, productId, transactionId);
    } catch (error) {
      return this.handlePurchasesError(error);
    }
  }

  async makePurchaseAndroid(
    productId: string,
    basePlanId?: string,
    offerId?: string
  ): Promise<HeliumPurchaseResult> {
    await this.setUpPromise;
    // Keep this value as up-to-date as possible
    await this.syncRevenueCatAppUserId();
    const result = await this.attemptPurchaseAndroid(productId, basePlanId, offerId);

    if (this.isRetryableResult(result)) {
      await this.delay(1000);
      return this.attemptPurchaseAndroid(productId, basePlanId, offerId);
    }
    return result;
  }

  private async attemptPurchaseAndroid(
    productId: string,
    basePlanId?: string,
    offerId?: string
  ): Promise<PurchaseAttemptResult> {
    // Handle subscription with base plan or offer
    if (basePlanId || offerId) {
      const subscriptionOption = await this.findAndroidSubscriptionOption(
        productId,
        basePlanId,
        offerId
      );

      if (subscriptionOption) {
        try {
          const customerInfo = (await Purchases.purchaseSubscriptionOption(subscriptionOption))
            .customerInfo;

          return this.evaluatePurchaseResult(customerInfo, productId);
        } catch (error) {
          return this.handlePurchasesError(error);
        }
      }
    }

    // Handle one-time purchase or subscription that didn't have matching base plan / offer
    let rcProduct: PurchasesStoreProduct | undefined;
    try {
      // Try non-subscription (NON_SUBSCRIPTION) product first; most likely not a sub at this point
      let products = await Purchases.getProducts([productId], PRODUCT_CATEGORY.NON_SUBSCRIPTION);
      if (products.length > 0) {
        rcProduct = products[0];
      } else {
        // Then try subscription product (let RC pick option since we couldn't find a match)
        products = await Purchases.getProducts([productId]);
        if (products.length > 0) {
          rcProduct = products[0];
        }
      }
    } catch {
      return {
        status: 'failed',
        shouldRetry: true,
        error: `[RevenueCat] Failed to retrieve Android product: ${productId}`,
      };
    }
    if (!rcProduct) {
      return {
        status: 'failed',
        shouldRetry: true,
        error: `[RevenueCat] Android product not found: ${productId}`,
      };
    }

    try {
      const customerInfo = (await Purchases.purchaseStoreProduct(rcProduct)).customerInfo;

      return this.evaluatePurchaseResult(customerInfo, productId);
    } catch (error) {
      return this.handlePurchasesError(error);
    }
  }

  // Android helper: Find subscription option
  private async findAndroidSubscriptionOption(
    productId: string,
    basePlanId?: string,
    offerId?: string
  ): Promise<SubscriptionOption | undefined> {
    try {
      const products = await Purchases.getProducts([productId]);
      if (products.length === 0) {
        return undefined;
      }

      // RC will return multiple products if multiple base plans per subscription
      // Collect all subscription options from all products into a flat list
      const allSubscriptionOptions = products.flatMap(
        (product) => product.subscriptionOptions ?? []
      );

      if (allSubscriptionOptions.length === 0) {
        return undefined;
      }

      let subscriptionOption: SubscriptionOption | undefined;

      if (offerId && basePlanId) {
        // Look for specific offer: "basePlanId:offerId"
        const targetId = `${basePlanId}:${offerId}`;
        subscriptionOption = allSubscriptionOptions.find((opt) => opt.id === targetId);
      }
      if (!subscriptionOption && basePlanId) {
        // Otherwise the RC option id will simply be base plan id
        subscriptionOption = allSubscriptionOptions.find((opt) => opt.id === basePlanId);
      }

      return subscriptionOption;
    } catch {
      return undefined;
    }
  }

  // Helper function to check if a product is active in CustomerInfo
  private isProductActive(customerInfo: CustomerInfo, productId: string): boolean {
    return (
      Object.values(customerInfo.entitlements.active).some(
        (entitlement: PurchasesEntitlementInfo) => entitlement.productIdentifier === productId
      ) ||
      customerInfo.activeSubscriptions.includes(productId) ||
      customerInfo.allPurchasedProductIdentifiers.includes(productId)
    );
  }

  // Helper function to process purchase result
  private evaluatePurchaseResult(
    customerInfo: CustomerInfo,
    productId: string,
    transactionId?: string
  ): HeliumPurchaseResult {
    if (!this.isProductActive(customerInfo, productId)) {
      console.log(
        '[Helium] Purchase succeeded but product not immediately active in customerInfo:',
        productId
      );
    }

    return { status: 'purchased', transactionId, productId };
  }

  // Helper function to handle RevenueCat purchase errors
  private handlePurchasesError(error: unknown): PurchaseAttemptResult {
    const purchasesError = error as PurchasesError;

    if (purchasesError?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
      return { status: 'pending' };
    }

    if (purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      return { status: 'cancelled' };
    }

    const errorDesc = purchasesError?.message || 'purchase failed.';
    const underlying = purchasesError?.underlyingErrorMessage;
    const errorMsg = underlying
      ? `[RevenueCat] ${errorDesc} code: ${purchasesError?.code} | ${underlying}`
      : `[RevenueCat] ${errorDesc} code: ${purchasesError?.code}`;
    return {
      status: 'failed',
      shouldRetry: RETRYABLE_RC_CODES.has(purchasesError?.code),
      error: errorMsg,
    };
  }

  async restorePurchases(): Promise<boolean> {
    await this.setUpPromise;
    try {
      const customerInfo = await Purchases.restorePurchases();
      return Object.keys(customerInfo.entitlements.active).length > 0;
    } catch {
      return false;
    }
  }

  private async getProduct(productId: string): Promise<PurchasesStoreProduct | undefined> {
    const products = await Purchases.getProducts([productId]);
    return products.length > 0 ? products[0] : undefined;
  }

  private isRetryableResult(result: PurchaseAttemptResult): boolean {
    return result.status === 'failed' && !!result.shouldRetry;
  }

  onHeliumEvent(event: HeliumPaywallEvent): void {
    if (event.type === 'purchaseSucceeded' && this.shouldSyncAfterThirdPartyPayment(event)) {
      this.syncRevenueCatAfterThirdPartyPayment().catch(() => {
        // Background sync must never propagate into the host app.
      });
    }
  }

  private shouldSyncAfterThirdPartyPayment(event: HeliumPaywallEvent): boolean {
    switch (event.paymentProcessor) {
      case 'stripe':
        return !this.stripePurchaseSyncDisabled;
      case 'paddle':
        return !this.paddlePurchaseSyncDisabled;
      default:
        return false;
    }
  }

  /**
   * After a third-party payment (Stripe or Paddle) completes, the RevenueCat SDK
   * on-device has no way to know that a new entitlement exists until its backend
   * processes the provider webhook. Without this, RevenueCat customer info would
   * remain stale until the next app launch or natural refresh. This method polls
   * RevenueCat with progressive backoff (~50s max), stopping early once customer
   * info actually differs from the pre-sync snapshot. Listener emissions alone
   * aren't trusted as the stop signal — the RevenueCat SDKs may re-emit info that
   * hasn't materially changed.
   */
  private async syncRevenueCatAfterThirdPartyPayment(): Promise<void> {
    if (this.isSyncingThirdPartyPayment) {
      return;
    }
    this.isSyncingThirdPartyPayment = true;

    let synced = false;
    let baseline: string | undefined;
    let listenerAdded = false;

    const markSyncedIfChanged = (info: CustomerInfo) => {
      const snapshot = entitlementSnapshot(info);
      if (baseline === undefined) {
        // The initial baseline fetch failed, so treat the first observed info
        // as the pre-purchase state. Marking it as synced instead could stop
        // the backoff on info that is still stale.
        baseline = snapshot;
        return;
      }
      if (snapshot !== baseline) {
        synced = true;
      }
    };

    const pollPhase = async (attempts: number, intervalMs: number) => {
      for (let i = 0; i < attempts && !synced; i++) {
        await this.delay(intervalMs);
        if (synced) break;
        try {
          await Purchases.invalidateCustomerInfoCache();
          markSyncedIfChanged(await Purchases.getCustomerInfo());
        } catch {
          /* catch anything unexpected like a network failure */
        }
      }
    };

    try {
      try {
        baseline = entitlementSnapshot(await Purchases.getCustomerInfo());
      } catch {
        // Baseline fetch failed; markSyncedIfChanged adopts the first
        // observed customer info as the baseline instead.
      }

      // Throws if RevenueCat has not been configured yet.
      Purchases.addCustomerInfoUpdateListener(markSyncedIfChanged);
      listenerAdded = true;

      await pollPhase(5, 1000); // Phase 1: every 1s for 5 attempts
      await pollPhase(3, 5000); // Phase 2: every 5s for 3 attempts
      await pollPhase(2, 15000); // Phase 3: every 15s for 2 attempts
    } finally {
      if (listenerAdded) {
        try {
          Purchases.removeCustomerInfoUpdateListener(markSyncedIfChanged);
        } catch {
          // Never let listener cleanup keep the sync flag stuck.
        }
      }
      this.isSyncingThirdPartyPayment = false;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Serializes the entitlement-relevant parts of CustomerInfo so two snapshots can
 * be compared without relying on the RevenueCat SDK's own equality or listener
 * notification rules.
 */
function entitlementSnapshot(info: CustomerInfo | null | undefined): string {
  const activeEntitlements = Object.keys(info?.entitlements?.active ?? {}).sort();
  const activeSubscriptions = [...(info?.activeSubscriptions ?? [])].sort();
  return JSON.stringify([activeEntitlements, activeSubscriptions]);
}
