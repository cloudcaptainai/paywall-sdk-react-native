export { createCustomPurchaseConfig } from './types';

export {
  initialize,
  presentUpsell,
  hideUpsell,
  hideAllUpsells,
  getPaywallInfo,
  handleDeepLink,
  setRevenueCatAppUserId,
  hasAnyActiveSubscription,
  hasAnyEntitlement,
  getExperimentInfoForTrigger,
  resetHelium,
  setCustomRestoreFailedStrings,
  disableRestoreFailedDialog,
  HELIUM_CTA_NAMES,
  NativeHeliumUpsellView,
} from './native-interface';

export type {
  HeliumTransactionStatus,
  HeliumConfig,
  HeliumUpsellViewProps,
  HeliumPaywallLoadingConfig,
  TriggerLoadingConfig,
  PaywallEventHandlers,
  PaywallOpenEvent,
  PaywallCloseEvent,
  PaywallDismissedEvent,
  PurchaseSucceededEvent,
  PaywallOpenFailedEvent,
  CustomPaywallActionEvent,
  HeliumPaywallEvent,
  PresentUpsellParams,
} from './types';

export type {
  ExperimentInfo,
  HashDetails,
  VariantDetails,
} from './HeliumExperimentInfo.types';
