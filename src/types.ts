export type HeliumTransactionStatus = 'completed' | 'failed' | 'cancelled' | 'pending' | 'restored';

export interface HeliumCallbacks {
  makePurchase: (productId: string) => Promise<HeliumTransactionStatus>;
  restorePurchases: () => Promise<boolean>;
  onHeliumPaywallEvent: (event: any) => void;
}

export interface HeliumConfig {
  apiKey: string;
  fallbackView?: number;
  triggers?: string[];
  customUserId?: string;
  customAPIEndpoint?: string;
  customUserTraits?: Record<string, any>;
}

export interface HeliumUpsellViewProps {
  trigger: string;
  style?: any;
} 