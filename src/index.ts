export { createRevenueCatPurchaseConfig } from './handlers/revenuecat';
export { createCustomPurchaseConfig } from './types';

export { HeliumProvider, initialize, presentUpsell, hideUpsell, hideAllUpsells, UpsellView, HELIUM_CTA_NAMES, useHelium, NativeHeliumUpsellView } from './native-interface';

export type { 
  HeliumTransactionStatus, 
  HeliumConfig, 
  HeliumUpsellViewProps, 
  RevenueCatPurchaseConfig, 
  CustomPurchaseConfig
} from './types'; 