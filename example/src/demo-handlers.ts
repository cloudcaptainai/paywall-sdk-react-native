import type { HeliumTransactionStatus, HeliumCallbacks } from '@tryheliumai/paywall-sdk-react-native';

// Simple demo implementation
export class DemoHeliumCallbacks implements HeliumCallbacks {
  private events: { timestamp: Date; event: any }[] = [];

  async makePurchase(productId: string): Promise<HeliumTransactionStatus> {
    this.events.push({ timestamp: new Date(), event: { type: 'purchase', productId } });
    return 'completed';
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