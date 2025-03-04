import type { HeliumTransactionStatus } from './types';

export interface HeliumCallbacks {
    makePurchase: (productId: string) => Promise<string>;
    restorePurchases: () => Promise<boolean>;  // Modified to return Promise
    onHeliumPaywallEvent: (event: any) => void;
    getCustomVariableValues: () => Record<string, any>;  // Modified to return directly
  }
  
  // Update the implementation
  export class DemoHeliumCallbacks implements HeliumCallbacks {
    private events: { timestamp: Date; event: any }[] = [];
  
    async makePurchase(productId: string): Promise<HeliumTransactionStatus> {
      this.events.push({ timestamp: new Date(), event: { type: 'purchase', productId } });
      return 'completed' as HeliumTransactionStatus;
    }
  
    async restorePurchases(): Promise<boolean> {
      this.events.push({ timestamp: new Date(), event: { type: 'restore' } });
      return true;
    }
  
    onHeliumPaywallEvent(event: any): void {
      this.events.push({ timestamp: new Date(), event });
    }
  
    getCustomVariableValues = (): Record<string, any> => {
      console.log('getCustomVariableValues called');
      return {
        exampleVar1: 'value1',
        exampleVar2: 'value2'
      };
    };
  
    getEventHistory() {
      return this.events;
    }
  }