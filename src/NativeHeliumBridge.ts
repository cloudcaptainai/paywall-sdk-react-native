import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  initialize(config: {
    apiKey: string;
    fallbackPaywall: number;
    triggers?: string[];
    customUserId?: string;
    customAPIEndpoint?: string;
    revenueCatAppUserId?: string;
  }): void;

  presentUpsell(trigger: string): void;
  // getFetchedTriggerNames(callback: (triggerNames: string[]) => void): void;
  // hideUpsell(): void;
  // hideAllUpsells(): void;
  // handlePurchaseResponse(response: {
  //   transactionId: string;
  //   status: string;
  //   error?: string;
  // }): void;
  // handleRestoreResponse(response: {
  //   transactionId: string;
  //   status: string;
  // }): void;
  // fallbackOpenOrCloseEvent(
  //   trigger: string | null,
  //   isOpen: boolean,
  //   viewType: string | null
  // ): void;
  //
  // // Add listeners for events (inherited from TurboModule)
  // addListener(eventType: string): void;
  // removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('HeliumBridge');
