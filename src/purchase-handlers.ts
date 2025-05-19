import type { HeliumTransactionStatus, HeliumPurchaseResult } from './types';

export interface HeliumCallbacks {
    makePurchase: (productId: string) => Promise<HeliumPurchaseResult>;
    restorePurchases: () => Promise<boolean>;  // Modified to return Promise
    onHeliumPaywallEvent: (event: any) => void;
  }
  
  // Update the implementation
  export class DemoHeliumCallbacks implements HeliumCallbacks {
    private events: { timestamp: Date; event: any }[] = [];
  
    async makePurchase(productId: string): Promise<HeliumPurchaseResult> {
      this.events.push({ timestamp: new Date(), event: { type: 'purchase', productId } });
      return { status: 'completed' as HeliumTransactionStatus };
    }
  
    async restorePurchases(): Promise<boolean> {
      this.events.push({ timestamp: new Date(), event: { type: 'restore' } });
      return true;
    }
  
    onHeliumPaywallEvent(event: any): void {
      this.events.push({ timestamp: new Date(), event });
    }
  
    getEventHistory() {
      return this.events;
    }
  }