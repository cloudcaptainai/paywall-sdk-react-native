import type {
  CustomerInfo,
  PurchasesEntitlementInfo,
  PurchasesError,
  PurchasesStoreProduct,
  SubscriptionOption,
} from 'react-native-purchases';
import Purchases, { PRODUCT_CATEGORY, PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { Platform } from 'react-native';
import type { HeliumPurchaseConfig, HeliumPurchaseResult } from '../types';
import { setRevenueCatAppUserId } from '../native-interface';

export interface RevenueCatConfig {
  /** RevenueCat API key (cross-platform). Only needed if RevenueCat is not already configured externally (e.g. via Purchases.configure). */
  apiKey?: string;
  /** iOS-specific RevenueCat API key. Takes precedence over `apiKey` on iOS. Only needed if RevenueCat is not already configured externally. */
  apiKeyIOS?: string;
  /** Android-specific RevenueCat API key. Takes precedence over `apiKey` on Android. Only needed if RevenueCat is not already configured externally. */
  apiKeyAndroid?: string;
}

export function createRevenueCatPurchaseConfig(config?: RevenueCatConfig): HeliumPurchaseConfig {
  const rcHandler = new RevenueCatHeliumHandler(config);
  return {
    makePurchaseIOS: rcHandler.makePurchaseIOS.bind(rcHandler),
    makePurchaseAndroid: rcHandler.makePurchaseAndroid.bind(rcHandler),
    restorePurchases: rcHandler.restorePurchases.bind(rcHandler),
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
  private setUpPromise: Promise<void>;

  constructor(config?: RevenueCatConfig) {
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

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
