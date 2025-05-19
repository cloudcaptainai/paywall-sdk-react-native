export type HeliumTransactionStatus = 'purchased' | 'failed' | 'cancelled' | 'pending' | 'restored';
export type HeliumPurchaseResult = {
  status: HeliumTransactionStatus;
  error?: string; // Optional error message
};
export type HeliumDownloadStatus = 'success' | 'failed' | 'inProgress' | 'notStarted';

// --- Purchase Configuration Types ---

/** Interface for providing custom purchase handling logic. */
export interface CustomPurchaseConfig {
  makePurchase: (productId: string) => Promise<HeliumPurchaseResult>;
  restorePurchases: () => Promise<boolean>;
  /** Discriminant property to identify custom callbacks */
  type: 'custom';
}

/** Configuration for using the built-in RevenueCat handler. */
export interface RevenueCatPurchaseConfig {
  /** Optional RevenueCat API Key. If not provided, RevenueCat must be configured elsewhere. */
  apiKey?: string;
   /** Discriminant property to identify RevenueCat config */
  type: 'revenuecat';
}

// Union type for the purchase configuration
export type HeliumPurchaseConfig = CustomPurchaseConfig | RevenueCatPurchaseConfig;
// Add other config types here in the future, e.g. | StripePurchaseConfig

// Helper function for creating Custom Purchase Config
export function createCustomPurchaseConfig(callbacks: {
  makePurchase: (productId: string) => Promise<HeliumPurchaseResult>;
  restorePurchases: () => Promise<boolean>;
}): CustomPurchaseConfig {
  return {
    type: 'custom',
    makePurchase: callbacks.makePurchase,
    restorePurchases: callbacks.restorePurchases,
  };
}

// --- Main Helium Configuration ---
export interface HeliumConfig {
  /** Your Helium API Key */
  apiKey: string;
  /** Configuration for handling purchases. Can be custom functions or a pre-built handler config. */
  purchaseConfig: HeliumPurchaseConfig;
  /** Callback for receiving all Helium paywall events. */
  onHeliumPaywallEvent: (event: any) => void; // Still mandatory
  
  // Optional configurations
  fallbackView?: number; 
  triggers?: string[];
  customUserId?: string;
  customAPIEndpoint?: string;
  customUserTraits?: Record<string, any>;
}

// --- Other Existing Types ---

export interface HeliumUpsellViewProps {
  trigger: string;
  style?: any;
} 