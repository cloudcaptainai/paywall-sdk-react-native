import {
  NativeModules,
  NativeEventEmitter,
  requireNativeComponent,
  Platform,
} from 'react-native';
import type {
  HeliumConfig,
  HeliumUpsellViewProps,
  HeliumDownloadStatus,
  HeliumLightDarkMode,
  HeliumLogEvent,
  DelegateActionEvent,
  NativeHeliumConfig,
  PaywallInfo,
  PresentUpsellParams,
  PaywallEventHandlers,
  HeliumPaywallEvent,
  ResetHeliumOptions,
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

let isInitialized = false;

const HELIUM_EVENT_NAMES = [
  'onHeliumPaywallEvent',
  'onDelegateActionEvent',
  'paywallEventHandlers',
  'onHeliumLogEvent',
  'onEntitledEvent',
] as const;

const removeAllHeliumListeners = () => {
  for (const name of HELIUM_EVENT_NAMES) {
    heliumEventEmitter.removeAllListeners(name);
  }
};

// JS-side download status mirror. TODO(native): replace with a native
// `HeliumBridge.getDownloadStatus()` call (as in the Expo module SDK) so this
// doesn't drift if events are missed.
let globalDownloadStatus: HeliumDownloadStatus = 'notDownloadedYet';
export const getDownloadStatus = () => globalDownloadStatus;

const updateDownloadStatus = (status: HeliumDownloadStatus) => {
  globalDownloadStatus = status;
};

function setupEventListeners(config: HeliumConfig) {
  // TODO(native): iOS/Android must emit onHeliumLogEvent and onEntitledEvent
  // under these exact names to match the Expo module SDK (not yet wired).
  removeAllHeliumListeners();

  heliumEventEmitter.addListener(
    'onHeliumPaywallEvent',
    (event: HeliumPaywallEvent) => {
      if (event.type === 'paywallsDownloadSuccess') {
        updateDownloadStatus('downloadSuccess');
      } else if (event.type === 'paywallsDownloadError') {
        updateDownloadStatus('downloadFailure');
      }

      handlePaywallEvent(event);
      try {
        config.purchaseConfig?.onHeliumEvent?.(event);
      } catch {}
      try {
        config.onHeliumPaywallEvent?.(event);
      } catch {}
    }
  );

  const purchaseConfig = config.purchaseConfig;
  if (purchaseConfig) {
    heliumEventEmitter.addListener(
      'onDelegateActionEvent',
      async (event: DelegateActionEvent) => {
        try {
          if (event.type === 'purchase') {
            if (!event.productId) {
              HeliumBridge.handlePurchaseResult(
                'failed',
                'No product ID for purchase event.'
              );
              return;
            }

            let result;

            if (Platform.OS === 'ios') {
              if (purchaseConfig.makePurchaseIOS) {
                result = await purchaseConfig.makePurchaseIOS(event.productId);
              } else if (purchaseConfig.makePurchase) {
                result = await purchaseConfig.makePurchase(event.productId);
              } else {
                console.log('[Helium] No iOS purchase handler configured.');
                HeliumBridge.handlePurchaseResult(
                  'failed',
                  'No iOS purchase handler configured.'
                );
                return;
              }
            } else if (Platform.OS === 'android') {
              if (purchaseConfig.makePurchaseAndroid) {
                result = await purchaseConfig.makePurchaseAndroid(
                  event.productId,
                  event.basePlanId,
                  event.offerId
                );
              } else {
                console.log('[Helium] No Android purchase handler configured.');
                HeliumBridge.handlePurchaseResult(
                  'failed',
                  'No Android purchase handler configured.'
                );
                return;
              }
            } else {
              HeliumBridge.handlePurchaseResult(
                'failed',
                'Unsupported platform.'
              );
              return;
            }

            HeliumBridge.handlePurchaseResult(
              result.status,
              result.error,
              result.transactionId,
              result.originalTransactionId,
              result.productId ?? event.productId
            );
          } else if (event.type === 'restore') {
            const success = await purchaseConfig.restorePurchases();
            HeliumBridge.handleRestoreResult(success);
          }
        } catch (error) {
          if (event.type === 'purchase') {
            console.log('[Helium] Unexpected error: ', error);
            HeliumBridge.handlePurchaseResult('failed');
          } else if (event.type === 'restore') {
            HeliumBridge.handleRestoreResult(false);
          }
        }
      }
    );
  }

  heliumEventEmitter.addListener(
    'paywallEventHandlers',
    (event: HeliumPaywallEvent) => {
      callPaywallEventHandlers(event);
    }
  );

  heliumEventEmitter.addListener('onHeliumLogEvent', (event: HeliumLogEvent) => {
    logHeliumEvent(event);
  });

  heliumEventEmitter.addListener('onEntitledEvent', () => {
    presentOnEntitled?.();
    presentOnEntitled = undefined;
  });
}

const buildNativeConfig = async (
  config: HeliumConfig
): Promise<NativeHeliumConfig> => {
  let fallbackBundleUrlString: string | undefined;
  let fallbackBundleString: string | undefined;
  if (config.fallbackBundle) {
    try {
      // Expo 49–51 uses the legacy `expo-file-system` API. Expo 52+ is handled
      // by the separate Expo-modules SDK, so we don't branch on the new API here.
      const ExpoFileSystem = require('expo-file-system');

      const jsonContent = JSON.stringify(config.fallbackBundle);
      fallbackBundleUrlString = `${ExpoFileSystem.documentDirectory}helium-fallback.json`;
      await ExpoFileSystem.writeAsStringAsync(
        fallbackBundleUrlString,
        jsonContent
      );
    } catch (error) {
      console.log(
        '[Helium] expo-file-system not available, passing fallback bundle as string.'
      );
      fallbackBundleString = JSON.stringify(config.fallbackBundle);
    }
  }

  return {
    apiKey: config.apiKey,
    customUserId: config.customUserId,
    customAPIEndpoint: config.customAPIEndpoint,
    customUserTraits: convertBooleansToMarkers(config.customUserTraits),
    revenueCatAppUserId: config.revenueCatAppUserId,
    fallbackBundleUrlString,
    fallbackBundleString,
    paywallLoadingConfig: convertBooleansToMarkers(config.paywallLoadingConfig),
    useDefaultDelegate: !config.purchaseConfig,
    environment: config.environment,
    wrapperSdkVersion: SDK_VERSION,
    delegateType: config.purchaseConfig?._delegateType,
    androidConsumableProductIds: config.androidConsumableProductIds,
  };
};

export const initialize = async (config: HeliumConfig) => {
  if (isInitialized) return;
  isInitialized = true;
  try {
    setupEventListeners(config);
    const nativeConfig = await buildNativeConfig(config);
    // TODO(native): iOS/Android initialize now takes a single NativeHeliumConfig
    // object (no second arg), matching the Expo module SDK.
    HeliumBridge.initialize(nativeConfig);
  } catch (error) {
    isInitialized = false;
    removeAllHeliumListeners();
    console.error('[Helium] Initialization failed:', error);
  }
};

let paywallEventHandlers: PaywallEventHandlers | undefined;
let presentOnPaywallUnavailable: (() => void) | undefined;
let presentOnEntitled: (() => void) | undefined;
export const presentUpsell = ({
  triggerName,
  eventHandlers,
  customPaywallTraits,
  dontShowIfAlreadyEntitled,
  androidDisableSystemBackNavigation,
  onEntitled,
  onPaywallUnavailable,
}: PresentUpsellParams) => {
  try {
    paywallEventHandlers = eventHandlers;
    presentOnPaywallUnavailable = onPaywallUnavailable;
    presentOnEntitled = onEntitled;
    // TODO(native): presentUpsell now accepts a 4th arg `androidDisableSystemBackNavigation`.
    HeliumBridge.presentUpsell(
      triggerName,
      convertBooleansToMarkers(customPaywallTraits),
      dontShowIfAlreadyEntitled,
      androidDisableSystemBackNavigation
    );
  } catch (error) {
    console.log('[Helium] presentUpsell error', error);
    paywallEventHandlers = undefined;
    presentOnPaywallUnavailable = undefined;
    presentOnEntitled = undefined;
    onPaywallUnavailable?.();
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
    try {
      paywallEventHandlers?.onAnyEvent?.(event);
    } catch {}
  }
}

function handlePaywallEvent(event: HeliumPaywallEvent) {
  switch (event.type) {
    case 'paywallClose':
      if (!event.isSecondTry) {
        paywallEventHandlers = undefined;
      }
      presentOnPaywallUnavailable = undefined;
      break;
    case 'paywallSkipped':
      paywallEventHandlers = undefined;
      presentOnPaywallUnavailable = undefined;
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
        presentOnPaywallUnavailable?.();
      }
      presentOnPaywallUnavailable = undefined;
      break;
  }
}

/**
 * Routes native SDK log events to the appropriate console method.
 * Log levels: 1=error, 2=warn, 3=info, 4=debug, 5=trace
 */
function logHeliumEvent(event: HeliumLogEvent) {
  const { level, message } = event;
  const metadata = event.metadata ?? {};
  const hasMetadata = Object.keys(metadata).length > 0;

  switch (level) {
    case 1:
      hasMetadata ? console.error(message, metadata) : console.error(message);
      break;
    case 2:
      hasMetadata ? console.warn(message, metadata) : console.warn(message);
      break;
    case 3:
      hasMetadata ? console.info(message, metadata) : console.info(message);
      break;
    case 4:
    case 5:
    default:
      hasMetadata ? console.debug(message, metadata) : console.debug(message);
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
  // TODO(native): update HeliumBridge.getPaywallInfo to return
  // { errorMsg?, templateName?, shouldShow? } via promise (currently uses callback).
  const result = await HeliumBridge.getPaywallInfo(trigger);
  if (!result) {
    console.log('[Helium] getPaywallInfo unexpected error.');
    return;
  }
  if (result.errorMsg) {
    console.log(`[Helium] ${result.errorMsg}`);
    return;
  }
  return {
    paywallTemplateName: result.templateName ?? 'unknown template',
    shouldShow: result.shouldShow ?? true,
  };
};

/**
 * @deprecated Deep link handling is being replaced with paywall previews.
 */
export const handleDeepLink = async (url: string | null): Promise<boolean> => {
  if (!url) return false;
  // TODO(native): update HeliumBridge.handleDeepLink to return a boolean via
  // promise (currently uses callback).
  const handled: boolean = await HeliumBridge.handleDeepLink(url);
  console.log('[Helium] Handled deep link:', handled);
  return handled;
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
 * An optional anonymous ID from your third-party analytics provider, sent alongside
 * every Helium analytics event so you can correlate Helium data with your own analytics
 * before you have set a custom user ID. Pass `null` to clear.
 *
 * - Amplitude: pass device ID
 * - Mixpanel: pass anonymous ID
 * - PostHog: pass anonymous ID
 *
 * Set this before calling `initialize()` for best results. Can also be updated after initialization.
 */
export const setThirdPartyAnalyticsAnonymousId = (
  anonymousId: string | null
): void => {
  try {
    // TODO(native): add HeliumBridge.setThirdPartyAnalyticsAnonymousId(anonymousId).
    HeliumBridge.setThirdPartyAnalyticsAnonymousId(anonymousId);
  } catch (e) {
    console.error('[Helium] Failed to set third-party analytics anonymous ID', e);
  }
};

/**
 * Checks if the user has an active entitlement for any product attached to the paywall that will show for provided trigger.
 * @param trigger The trigger name to check entitlement for
 * @returns Promise resolving to true if entitled, false if not, or undefined if not known (i.e. the paywall is not downloaded yet)
 */
export const hasEntitlementForPaywall = async (
  trigger: string
): Promise<boolean | undefined> => {
  // TODO(native): update HeliumBridge.hasEntitlementForPaywall to return
  // { hasEntitlement?: boolean } (currently returns a bare boolean).
  const result = await HeliumBridge.hasEntitlementForPaywall(trigger);
  return result?.hasEntitlement;
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
  // TODO(native): update HeliumBridge.getExperimentInfoForTrigger to return an
  // ExperimentInfoResult ({ getExperimentInfoErrorMsg?, experimentId?, ... })
  // via promise (currently uses callback).
  const result = await HeliumBridge.getExperimentInfoForTrigger(trigger);
  if (!result) {
    console.log('[Helium] getExperimentInfoForTrigger unexpected error.');
    return;
  }
  if (result.getExperimentInfoErrorMsg) {
    console.log(`[Helium] ${result.getExperimentInfoErrorMsg}`);
    return;
  }
  if (!result.experimentId) {
    console.log(
      '[Helium] getExperimentInfoForTrigger returned data without required experimentId field.'
    );
    return;
  }
  return result as ExperimentInfo;
};

/**
 * Reset Helium entirely so you can call initialize again. Only for advanced use cases.
 */
export const resetHelium = async (
  options?: ResetHeliumOptions
): Promise<void> => {
  paywallEventHandlers = undefined;
  presentOnPaywallUnavailable = undefined;
  presentOnEntitled = undefined;
  removeAllHeliumListeners();

  try {
    // TODO(native): HeliumBridge.resetHelium(clearUserTraits, clearHeliumEventListeners, clearExperimentAllocations)
    // should be a promise-returning 3-arg call (currently sync, no args).
    await HeliumBridge.resetHelium(
      options?.clearUserTraits ?? true,
      true, // always clear for now, these listeners are not yet exposed to RN
      options?.clearExperimentAllocations ?? false
    );
  } catch (e) {
    // Native reset likely completed; the async bridge response may have been
    // lost (e.g. coroutine cancellation during module teardown). JS state is
    // cleaned up below regardless.
    console.warn('[Helium] resetHelium did not receive native completion:', e);
  } finally {
    globalDownloadStatus = 'notDownloadedYet';
    isInitialized = false;
  }
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

/**
 * Recursively converts boolean values to special marker strings to preserve
 * type information when passing through the native bridge.
 *
 * The native bridge converts booleans to NSNumber (0/1), making them
 * indistinguishable from actual numeric values. This helper converts:
 * - true -> "__helium_rn_bool_true__"
 * - false -> "__helium_rn_bool_false__"
 * - All other values remain unchanged (null/undefined are stripped)
 */
function convertBooleansToMarkers(
  input: Record<string, any> | undefined
): Record<string, any> | undefined {
  if (!input) return undefined;

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
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
