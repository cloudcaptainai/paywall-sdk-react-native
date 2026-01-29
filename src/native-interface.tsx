import {
  NativeModules,
  NativeEventEmitter,
  requireNativeComponent,
} from 'react-native';
import type {
  HeliumConfig,
  HeliumUpsellViewProps,
  HeliumDownloadStatus,
  HeliumLightDarkMode,
  PaywallInfo,
  PresentUpsellParams,
  PaywallEventHandlers,
  HeliumPaywallEvent,
} from './types';
import type { ExperimentInfo } from './HeliumExperimentInfo.types';

const { HeliumBridge } = NativeModules;

let SDK_VERSION = 'unknown';
try {
  SDK_VERSION = require('@tryheliumai/paywall-sdk-react-native/package.json').version;
} catch {
  // package.json can't be loaded, accept that we won't get wrapper sdk version
}
const heliumEventEmitter = new NativeEventEmitter(HeliumBridge);

// Register the native component once at module level
export const NativeHeliumUpsellView =
  requireNativeComponent<HeliumUpsellViewProps>('HeliumUpsellView');

// Add a flag to track if initialization has occurred
let isInitialized = false;
// Add module-level download status tracking
let globalDownloadStatus: HeliumDownloadStatus = 'notStarted';
export const getDownloadStatus = () => globalDownloadStatus;

const updateDownloadStatus = (status: HeliumDownloadStatus) => {
  globalDownloadStatus = status;
};

export const initialize = async (config: HeliumConfig) => {
  // Early return if already initialized
  if (isInitialized) {
    console.log('[Helium] Already initialized, skipping...');
    return;
  }

  const purchaseHandler = config.purchaseConfig
    ? {
        makePurchase: config.purchaseConfig.makePurchase,
        restorePurchases: config.purchaseConfig.restorePurchases,
      }
    : null;

  // Update download status to inProgress
  updateDownloadStatus('inProgress');

  // Ensure these don't get added more than once
  heliumEventEmitter.removeAllListeners('helium_paywall_event');
  heliumEventEmitter.removeAllListeners('paywallEventHandlers');
  heliumEventEmitter.removeAllListeners('helium_make_purchase');
  heliumEventEmitter.removeAllListeners('helium_restore_purchases');

  // Set up event listeners
  heliumEventEmitter.addListener(
    'helium_paywall_event',
    (event: HeliumPaywallEvent) => {
      // Handle download status events
      if (event.type === 'paywallsDownloadSuccess') {
        updateDownloadStatus('success');
      } else if (event.type === 'paywallsDownloadError') {
        updateDownloadStatus('failed');
      }

      // Handle internal event logic first
      handlePaywallEvent(event);

      // Forward all events to the callback provided in config
      config.onHeliumPaywallEvent?.(event);
    }
  );

  // Set up paywall event handlers listener
  heliumEventEmitter.addListener(
    'paywallEventHandlers',
    (event: HeliumPaywallEvent) => {
      callPaywallEventHandlers(event);
    }
  );

  // Set up purchase event listeners only if we have a purchase handler
  if (purchaseHandler) {
    // Set up purchase event listener using the determined handler
    heliumEventEmitter.addListener(
      'helium_make_purchase',
      async (event: { productId: string; transactionId: string }) => {
        const result = await purchaseHandler.makePurchase(event.productId);
        HeliumBridge.handlePurchaseResponse({
          transactionId: event.transactionId,
          status: result.status,
          error: result.error,
        });
      }
    );

    // Set up restore purchases event listener using the determined handler
    heliumEventEmitter.addListener(
      'helium_restore_purchases',
      async (event: { transactionId: string }) => {
        const success = await purchaseHandler.restorePurchases();
        HeliumBridge.handleRestoreResponse({
          transactionId: event.transactionId,
          status: success ? 'restored' : 'failed',
        });
      }
    );
  }

  let fallbackBundleUrlString;
  let fallbackBundleString;
  if (config.fallbackBundle) {
    try {
      const ExpoFileSystem = require('expo-file-system');

      const jsonContent = JSON.stringify(config.fallbackBundle);

      // Write to documents directory
      fallbackBundleUrlString = `${ExpoFileSystem.documentDirectory}helium-fallback.json`;
      await ExpoFileSystem.writeAsStringAsync(
        fallbackBundleUrlString,
        jsonContent
      );
    } catch (error) {
      // Fallback to string approach if expo-file-system isn't available
      console.log(
        '[Helium] expo-file-system not available, attempting to pass fallback bundle as string.'
      );
      fallbackBundleString = JSON.stringify(config.fallbackBundle);
    }
  }

  HeliumBridge.initialize(
    {
      apiKey: config.apiKey,
      customUserId: config.customUserId || null,
      customAPIEndpoint: config.customAPIEndpoint || null,
      customUserTraits: convertBooleansToMarkers(
        config.customUserTraits == null ? {} : config.customUserTraits
      ),
      revenueCatAppUserId: config.revenueCatAppUserId,
      fallbackBundleUrlString: fallbackBundleUrlString,
      fallbackBundleString: fallbackBundleString,
      paywallLoadingConfig: convertBooleansToMarkers(
        config.paywallLoadingConfig
      ),
      useDefaultDelegate: !config.purchaseConfig,
      wrapperSdkVersion: SDK_VERSION,
    },
    {}
  );

  // Mark as initialized after successful initialization
  isInitialized = true;
};

let paywallEventHandlers: PaywallEventHandlers | undefined;
let presentOnFallback: (() => void) | undefined;
export const presentUpsell = ({
  triggerName,
  onFallback,
  eventHandlers,
  customPaywallTraits,
  dontShowIfAlreadyEntitled,
}: PresentUpsellParams) => {
  try {
    paywallEventHandlers = eventHandlers;
    presentOnFallback = onFallback;
    HeliumBridge.presentUpsell(
      triggerName,
      convertBooleansToMarkers(customPaywallTraits) || null,
      dontShowIfAlreadyEntitled ?? false
    );
  } catch (error) {
    console.log('[Helium] presentUpsell error', error);
    paywallEventHandlers = undefined;
    presentOnFallback = undefined;
    onFallback?.();
    HeliumBridge.fallbackOpenOrCloseEvent(triggerName, true, 'presented');
  }
};

function callPaywallEventHandlers(event: HeliumPaywallEvent) {
  if (paywallEventHandlers) {
    switch (event.type) {
      case 'paywallOpen':
        paywallEventHandlers?.onOpen?.({
          type: 'paywallOpen',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          isSecondTry: event.isSecondTry ?? false,
          viewType: 'presented',
        });
        break;
      case 'paywallClose':
        paywallEventHandlers?.onClose?.({
          type: 'paywallClose',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          isSecondTry: event.isSecondTry ?? false,
        });
        break;
      case 'paywallDismissed':
        paywallEventHandlers?.onDismissed?.({
          type: 'paywallDismissed',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          isSecondTry: event.isSecondTry ?? false,
        });
        break;
      case 'purchaseSucceeded':
        paywallEventHandlers?.onPurchaseSucceeded?.({
          type: 'purchaseSucceeded',
          productId: event.productId ?? 'unknown',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          isSecondTry: event.isSecondTry ?? false,
        });
        break;
      case 'paywallOpenFailed':
        paywallEventHandlers?.onOpenFailed?.({
          type: 'paywallOpenFailed',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          error: event.error ?? 'Unknown error',
          paywallUnavailableReason: event.paywallUnavailableReason,
          isSecondTry: event.isSecondTry ?? false,
        });
        break;
      case 'customPaywallAction':
        paywallEventHandlers?.onCustomPaywallAction?.({
          type: 'customPaywallAction',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          actionName: event.customPaywallActionName ?? 'unknown',
          params: event.customPaywallActionParams ?? {},
          isSecondTry: event.isSecondTry ?? false,
        });
        break;
    }
    paywallEventHandlers?.onAnyEvent?.(event);
  }
}

function handlePaywallEvent(event: HeliumPaywallEvent) {
  switch (event.type) {
    case 'paywallClose':
      if (!event.isSecondTry) {
        paywallEventHandlers = undefined;
      }
      presentOnFallback = undefined;
      break;
    case 'paywallSkipped':
      paywallEventHandlers = undefined;
      presentOnFallback = undefined;
      break;
    case 'paywallOpenFailed':
      paywallEventHandlers = undefined;
      const unavailableReason = event.paywallUnavailableReason;
      if (
        event.triggerName &&
        unavailableReason !== 'alreadyPresented' &&
        unavailableReason !== 'secondTryNoMatch'
      ) {
        console.log('[Helium] paywall open failed', unavailableReason);
        presentOnFallback?.();
      }
      presentOnFallback = undefined;
      break;
  }
}

export const hideUpsell = () => {
  HeliumBridge.hideUpsell();
};

export const hideAllUpsells = () => {
  HeliumBridge.hideAllUpsells();
};

export const getPaywallInfo = async (
  trigger: string
): Promise<PaywallInfo | undefined> => {
  return new Promise((resolve) => {
    HeliumBridge.getPaywallInfo(
      trigger,
      (error: string | null, templateName: string, shouldShow: boolean) => {
        if (error) {
          console.log(`[Helium] ${error}`);
          resolve(undefined);
          return;
        }
        resolve({
          paywallTemplateName: templateName,
          shouldShow: shouldShow,
        });
      }
    );
  });
};

export const handleDeepLink = async (url: string | null): Promise<boolean> => {
  return new Promise((resolve) => {
    if (url) {
      HeliumBridge.handleDeepLink(url, (handled: boolean) => {
        console.log('[Helium] Handled deep link:', handled);
        resolve(handled);
      });
    } else {
      resolve(false);
    }
  });
};

export const setRevenueCatAppUserId = (rcAppUserId: string) => {
  HeliumBridge.setRevenueCatAppUserId(rcAppUserId);
};

/**
 * Set a custom user ID for the current user
 */
export const setCustomUserId = (newUserId: string) => {
  HeliumBridge.setCustomUserId(newUserId);
};

/**
 * Checks if the user has an active entitlement for any product attached to the paywall that will show for provided trigger.
 * @param trigger The trigger name to check entitlement for
 * @returns Promise resolving to true if entitled, false if not, or undefined if not known (i.e. the paywall is not downloaded yet)
 */
export const hasEntitlementForPaywall = async (
  trigger: string
): Promise<boolean | undefined> => {
  return HeliumBridge.hasEntitlementForPaywall(trigger);
};

/**
 * Checks if the user has any active subscription (including non-renewable)
 */
export const hasAnyActiveSubscription = async (): Promise<boolean> => {
  return HeliumBridge.hasAnyActiveSubscription();
};

/**
 * Checks if the user has any entitlement
 */
export const hasAnyEntitlement = async (): Promise<boolean> => {
  return HeliumBridge.hasAnyEntitlement();
};

/**
 * Get experiment allocation info for a specific trigger
 *
 * @param trigger The trigger name to get experiment info for
 * @returns ExperimentInfo if the trigger has experiment data, undefined otherwise
 */
export const getExperimentInfoForTrigger = async (
  trigger: string
): Promise<ExperimentInfo | undefined> => {
  return new Promise((resolve) => {
    HeliumBridge.getExperimentInfoForTrigger(
      trigger,
      (success: boolean, data: any) => {
        if (!success) {
          resolve(undefined);
          return;
        }
        resolve(data as ExperimentInfo);
      }
    );
  });
};

/**
 * Reset Helium entirely so you can call initialize again. Only for advanced use cases.
 */
export const resetHelium = () => {
  paywallEventHandlers = undefined;
  presentOnFallback = undefined;
  heliumEventEmitter.removeAllListeners('helium_paywall_event');
  heliumEventEmitter.removeAllListeners('paywallEventHandlers');
  heliumEventEmitter.removeAllListeners('helium_make_purchase');
  heliumEventEmitter.removeAllListeners('helium_restore_purchases');
  HeliumBridge.resetHelium();
  globalDownloadStatus = 'notStarted';
  isInitialized = false;
};

/**
 * Set custom strings to show in the dialog that Helium will display if a "Restore Purchases" action is not successful.
 * Note that these strings will not be localized by Helium for you.
 */
export const setCustomRestoreFailedStrings = (
  customTitle?: string,
  customMessage?: string,
  customCloseButtonText?: string
) => {
  HeliumBridge.setCustomRestoreFailedStrings(
    customTitle,
    customMessage,
    customCloseButtonText
  );
};

/**
 * Disable the default dialog that Helium will display if a "Restore Purchases" action is not successful.
 * You can handle this yourself if desired by listening for the PurchaseRestoreFailedEvent.
 */
export const disableRestoreFailedDialog = () => {
  HeliumBridge.disableRestoreFailedDialog();
};

/**
 * Override the light/dark mode for Helium paywalls
 * @param mode The mode to set: 'light', 'dark', or 'system' (follows device setting)
 */
export const setLightDarkModeOverride = (mode: HeliumLightDarkMode) => {
  HeliumBridge.setLightDarkModeOverride(mode);
};

export const HELIUM_CTA_NAMES = {
  SCHEDULE_CALL: 'schedule_call',
  SUBSCRIBE_BUTTON: 'subscribe_button',
};

function convertBooleansToMarkers(
  input: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!input) return undefined;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    result[key] = convertValueBooleansToMarkers(value);
  }
  return result;
}
function convertValueBooleansToMarkers(value: any): any {
  if (typeof value === 'boolean') {
    return value ? '__helium_rn_bool_true__' : '__helium_rn_bool_false__';
  } else if (value && typeof value === 'object' && !Array.isArray(value)) {
    return convertBooleansToMarkers(value);
  } else if (value && Array.isArray(value)) {
    return value.map(convertValueBooleansToMarkers);
  }
  return value;
}
