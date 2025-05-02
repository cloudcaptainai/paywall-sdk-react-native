export type HeliumTransactionStatus = 'completed' | 'failed' | 'cancelled' | 'pending' | 'restored';
export type HeliumPurchaseResult = {
  status: HeliumTransactionStatus;
  error?: string; // Optional error message
};
export type HeliumDownloadStatus = 'success' | 'failed' | 'inProgress' | 'notStarted';

export interface HeliumCallbacks {
  makePurchase: (productId: string) => Promise<HeliumPurchaseResult>;
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