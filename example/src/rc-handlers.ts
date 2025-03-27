import { HELIUM_CTA_NAMES, HeliumCallbacks, HeliumTransactionStatus } from '@tryheliumai/paywall-sdk-react-native';
import amplitude from '@amplitude/analytics-react-native';
import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import { Linking } from 'react-native';

// RevenueCat implementation example
export class TestRevenueCatHeliumCallbacks {
  constructor() {
    // Initialize class properties
    this.events = [];
    this.productIdToPackageMapping = {};
    
    // Initialize the mapping asynchronously
    this.initializePackageMapping();
  }

  async initializePackageMapping() {
    try {
      // In a real implementation, you would fetch packages from RevenueCat
      // This is just a placeholder for demonstration purposes
      const offerings = await Purchases.getOfferings();
      if (offerings.current?.availablePackages) {
        // Map product IDs to their corresponding packages
        offerings.current.availablePackages.forEach(pkg => {
          if (pkg.product.identifier) {
            this.productIdToPackageMapping[pkg.product.identifier] = pkg;
          }
        });
      }
    } catch (error) {
      console.error('Failed to initialize package mapping:', error);
    }
  }

  async makePurchase(productId): Promise<HeliumTransactionStatus> {
    try {
      const pkg = this.productIdToPackageMapping[productId];
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (customerInfo.entitlements.active["monthly_subscription"] !== undefined || customerInfo.entitlements.active["yearly_subscription"] !== undefined) {
        return 'completed';
      }
      return 'failed';
    } catch (error) {
      const purchasesError = error;
      if (purchasesError && purchasesError.code === PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR) {
        return 'pending';
      }
      if (purchasesError && purchasesError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
        return 'cancelled';
      }
      return 'failed';
    }
  }

  async restorePurchases() {
    try {
      const customerInfo = await Purchases.restorePurchases();
      // Check if any entitlements are active after restoration
      return Object.keys(customerInfo.entitlements.active).length > 0;
    } catch (error) {
      console.error('Failed to restore purchases:', error);
      return false;
    }
  }

  onHeliumPaywallEvent(event) {
    switch (event.type) {
      case 'paywallOpen':
        console.log('Paywall opened');
        break;
      case 'ctaPressed':
        if (event.ctaName === HELIUM_CTA_NAMES.SCHEDULE_CALL) {
          Linking.openURL('https://example.com');
        }
        break;
      case 'subscriptionSucceeded':
        const rcPackage = this.productIdToPackageMapping[event.productKey];
        // Custom amplitude tracking
        amplitude.track('rc_subscription_succeeded', {
          productKey: event.productKey,
          productName: rcPackage?.product.title,
          price: rcPackage?.product.priceString,
          currency: rcPackage?.product.currencyCode,
          // ... etc
        });
        // Add in logic to update the user's subscription status e.g. based on current entitlements, and add any navigation logic needed
        break;
    }
  }
}