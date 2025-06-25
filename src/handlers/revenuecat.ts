import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import type { HeliumPurchaseConfig, HeliumPurchaseResult } from '../types';
import type { PurchasesError, PurchasesPackage, CustomerInfoUpdateListener, CustomerInfo, PurchasesEntitlementInfo } from 'react-native-purchases';

// Rename the factory function
export function createRevenueCatPurchaseConfig(config?: {
  apiKey?: string;
}): HeliumPurchaseConfig {
    const rcHandler = new RevenueCatHeliumHandler(config?.apiKey);
    return {
      apiKey: config?.apiKey,
      makePurchase: rcHandler.makePurchase.bind(rcHandler),
      restorePurchases: rcHandler.restorePurchases.bind(rcHandler),
    };
}

export class RevenueCatHeliumHandler {
    private productIdToPackageMapping: Record<string, PurchasesPackage> = {};
    private isMappingInitialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;

    constructor(apiKey?: string) {
        if (apiKey) {
            Purchases.configure({ apiKey });
        } else {
        }
        this.initializePackageMapping();
    }

    private async initializePackageMapping(): Promise<void> {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }
        this.initializationPromise = (async () => {
            try {
                const offerings = await Purchases.getOfferings();
                if (offerings.current?.availablePackages) {
                    offerings.current.availablePackages.forEach((pkg: PurchasesPackage) => {
                        if (pkg.product?.identifier) {
                            this.productIdToPackageMapping[pkg.product.identifier] = pkg;
                        }
                    });
                } else {
                }
                this.isMappingInitialized = true;
            } catch (error) {
                this.isMappingInitialized = false;
            } finally {
                 this.initializationPromise = null;
            }
        })();
         return this.initializationPromise;
    }

    private async ensureMappingInitialized(): Promise<void> {
        if (!this.isMappingInitialized && !this.initializationPromise) {
            await this.initializePackageMapping();
        } else if (this.initializationPromise) {
            await this.initializationPromise;
        }
    }

    async makePurchase(productId: string): Promise<HeliumPurchaseResult> {
        await this.ensureMappingInitialized();

        const pkg: PurchasesPackage | undefined = this.productIdToPackageMapping[productId];
        if (!pkg) {
            return { status: 'failed', error: `RevenueCat Package not found for ID: ${productId}` };
        }

        try {
            const { customerInfo } = await Purchases.purchasePackage(pkg);
            const isActive = this.isProductActive(customerInfo, productId);
            if (isActive) {
                return { status: 'purchased' };
            } else {
                // This case might occur if the purchase succeeded but the entitlement wasn't immediately active
                // or if a different product became active.
                // Consider if polling/listening might be needed here too, similar to pending.
                // For now, returning failed as the specific product isn't confirmed active.
                return { status: 'failed', error: 'Purchase possibly complete but entitlement/subscription not active for this product.' };
            }
        } catch (error) {
            const purchasesError = error as PurchasesError;

            if (purchasesError?.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
                // Wait for a terminal state for up to 5 seconds
                return new Promise((resolve) => {
                    // Define the listener function separately to remove it later
                    const updateListener: CustomerInfoUpdateListener = (updatedCustomerInfo: CustomerInfo) => {
                        const isActive = this.isProductActive(updatedCustomerInfo, productId);
                        if (isActive) {
                            clearTimeout(timeoutId);
                            // Remove listener using the function reference
                            Purchases.removeCustomerInfoUpdateListener(updateListener);
                            resolve({ status: 'purchased' });
                        }
                    };

                    const timeoutId = setTimeout(() => {
                         // Remove listener using the function reference on timeout
                        Purchases.removeCustomerInfoUpdateListener(updateListener);
                        resolve({ status: 'pending' });
                    }, 5000);

                    // Add the listener
                    Purchases.addCustomerInfoUpdateListener(updateListener);
                });
            }

            if (purchasesError?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
                return { status: 'cancelled' };
            }

            // Handle other errors
            return { status: 'failed', error: purchasesError?.message || 'RevenueCat purchase failed.' };
        }
    }

    // Helper function to check if a product is active in CustomerInfo
    private isProductActive(customerInfo: CustomerInfo, productId: string): boolean {
        return Object.values(customerInfo.entitlements.active).some((entitlement: PurchasesEntitlementInfo) => entitlement.productIdentifier === productId)
               || customerInfo.activeSubscriptions.includes(productId)
               || customerInfo.allPurchasedProductIdentifiers.includes(productId);
    }

    async restorePurchases(): Promise<boolean> {
        try {
            const customerInfo = await Purchases.restorePurchases();
            const isActive = Object.keys(customerInfo.entitlements.active).length > 0;
            return isActive;
        } catch (error) {
            return false;
        }
    }
}