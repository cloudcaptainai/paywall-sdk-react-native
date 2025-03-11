import type { HeliumTransactionStatus, HeliumCallbacks } from '@tryheliumai/paywall-sdk-react-native';

// Simple demo implementation
export class DemoHeliumCallbacks implements HeliumCallbacks {
  private events: { timestamp: Date; event: any }[] = [];

  async makePurchase(productId: string): Promise<HeliumTransactionStatus> {
    return 'completed';
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