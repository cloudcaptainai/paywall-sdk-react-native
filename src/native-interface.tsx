import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import type {
  HeliumConfig,
  HeliumDownloadStatus,
  HeliumLightDarkMode,
  HeliumLogEvent,
  DelegateActionEvent,
  NativeHeliumConfig,
  PaywallInfo,
  PresentUpsellParams,
  PaywallEventHandlers,
  HeliumPaywallEvent,
  PaywallEntitledEvent,
  PaywallSkippedEvent,
  HeliumTransactionStatus,
  HeliumCheckoutRedirectType,
  ResetHeliumOptions,
  WebCheckoutProcessor,
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

let isInitialized = false;

export const getDownloadStatus = async (): Promise<HeliumDownloadStatus> => {
  return HeliumBridge.getDownloadStatus();
};

const HELIUM_EVENT_NAMES = [
  'onHeliumPaywallEvent',
  'onDelegateActionEvent',
  'paywallEventHandlers',
  'onHeliumLogEvent',
  'onEntitledEvent',
  'onPaywallSkipEvent',
] as const;

const removeAllHeliumListeners = () => {
  for (const name of HELIUM_EVENT_NAMES) {
    try {
      heliumEventEmitter.removeAllListeners(name);
    } catch (e) {
      console.warn(`[Helium] Failed to remove listeners for ${name}:`, e);
    }
  }
};

function setupEventListeners(config: HeliumConfig) {
  removeAllHeliumListeners();

  heliumEventEmitter.addListener('onHeliumPaywallEvent', (event: HeliumPaywallEvent) => {
    handlePaywallEvent(event);
    try {
      config.purchaseConfig?.onHeliumEvent?.(event);
    } catch {}
    try {
      config.onHeliumPaywallEvent?.(event);
    } catch {}
  });

  const purchaseConfig = config.purchaseConfig;
  if (purchaseConfig) {
    heliumEventEmitter.addListener('onDelegateActionEvent', async (event: DelegateActionEvent) => {
      try {
        if (event.type === 'purchase') {
          if (!event.productId) {
            HeliumBridge.handlePurchaseResult('failed', 'No product ID for purchase event.');
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
              HeliumBridge.handlePurchaseResult('failed', 'No iOS purchase handler configured.');
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
            HeliumBridge.handlePurchaseResult('failed', 'Unsupported platform.');
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
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (event.type === 'purchase') {
          console.log('[Helium] Unexpected error: ', error);
          HeliumBridge.handlePurchaseResult('failed', errorMsg);
        } else if (event.type === 'restore') {
          HeliumBridge.handleRestoreResult(false);
        }
      }
    });
  }

  heliumEventEmitter.addListener('paywallEventHandlers', (event: HeliumPaywallEvent) => {
    callPaywallEventHandlers(event);
  });

  heliumEventEmitter.addListener('onHeliumLogEvent', (event: HeliumLogEvent) => {
    logHeliumEvent(event);
  });

  heliumEventEmitter.addListener('onEntitledEvent', (event?: PaywallEntitledEvent) => {
    try {
      const entitledEvent = event && event.type ? event : undefined;
      if (presentOnEntitled) {
        dispatchEntitled(entitledEvent);
      } else if (entitledEvent?.type === 'paywallSkipped') {
        if (!entitledEvent.triggerName || !entitledEvent.skipReason) {
          console.warn(
            '[Helium] paywallSkipped event is missing triggerName or skipReason',
            entitledEvent
          );
        }
        dispatchPaywallSkip({
          type: 'paywallSkipped',
          triggerName: entitledEvent.triggerName ?? 'hlm_unknown',
          skipReason: entitledEvent.skipReason ?? 'unknown',
        });
      }
    } catch (e) {
      console.error('[Helium] onEntitledEvent handler failed', e);
    }
  });

  heliumEventEmitter.addListener('onPaywallSkipEvent', (event: PaywallSkippedEvent) => {
    try {
      dispatchPaywallSkip(event);
    } catch (e) {
      console.error('[Helium] onPaywallSkipEvent handler failed', e);
    }
  });
}

const buildNativeConfig = async (config: HeliumConfig): Promise<NativeHeliumConfig> => {
  let fallbackBundleUrlString: string | undefined;
  let fallbackBundleString: string | undefined;
  if (config.fallbackBundle) {
    try {
      // Expo 49–51 uses the legacy `expo-file-system` API. Expo 52+ is handled
      // by the separate Expo-modules SDK, so we don't branch on the new API here.
      const ExpoFileSystem = require('expo-file-system');

      const jsonContent = JSON.stringify(config.fallbackBundle);
      fallbackBundleUrlString = `${ExpoFileSystem.documentDirectory}helium-fallback.json`;
      await ExpoFileSystem.writeAsStringAsync(fallbackBundleUrlString, jsonContent);
    } catch (error) {
      console.log('[Helium] expo-file-system not available, passing fallback bundle as string.');
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
  if (!config.apiKey) {
    console.error('[Helium] initialize called without an apiKey; aborting.');
    return;
  }
  isInitialized = true;
  try {
    setupEventListeners(config);
    const nativeConfig = await buildNativeConfig(config);
    HeliumBridge.initialize(nativeConfig);
  } catch (error) {
    isInitialized = false;
    removeAllHeliumListeners();
    console.error('[Helium] Initialization failed:', error);
  }
};

let paywallEventHandlers: PaywallEventHandlers | undefined;
let presentOnPaywallUnavailable: (() => void) | undefined;
let presentOnEntitled: ((event?: PaywallEntitledEvent) => void) | undefined;
let presentOnPaywallSkip: ((event: PaywallSkippedEvent) => void) | undefined;
/**
 * Presents a full-screen paywall for the specified trigger.
 *
 * You must have a trigger and workflow configured in the Helium dashboard (https://app.tryhelium.com/workflows)
 * in order to show a paywall. See `PresentUpsellParams` for every option.
 */
export const presentUpsell = ({
  triggerName,
  eventHandlers,
  customPaywallTraits,
  dontShowIfAlreadyEntitled,
  androidDisableSystemBackNavigation,
  onEntitled,
  onPaywallSkip,
  onPaywallUnavailable,
}: PresentUpsellParams) => {
  try {
    paywallEventHandlers = eventHandlers;
    presentOnPaywallUnavailable = onPaywallUnavailable;
    presentOnEntitled = onEntitled;
    presentOnPaywallSkip = onPaywallSkip;
    HeliumBridge.presentUpsell(
      triggerName,
      convertBooleansToMarkers(customPaywallTraits),
      // BOOL/Boolean bridge args are non-nullable primitives; undefined aborts
      // the native call with RCTLogArgumentError before it is invoked.
      dontShowIfAlreadyEntitled ?? false,
      androidDisableSystemBackNavigation ?? false
    );
  } catch (error) {
    console.log('[Helium] presentUpsell error', error);
    paywallEventHandlers = undefined;
    presentOnPaywallUnavailable = undefined;
    presentOnEntitled = undefined;
    presentOnPaywallSkip = undefined;
    onPaywallUnavailable?.();
    HeliumBridge.fallbackOpenOrCloseEvent(triggerName, true, 'presented');
  }
};

function callPaywallEventHandlers(event: HeliumPaywallEvent) {
  if (paywallEventHandlers) {
    try {
      dispatchTypedPaywallEventHandler(event);
    } catch (e) {
      console.error('[Helium] paywall event handler threw', e);
    }
    try {
      paywallEventHandlers?.onAnyEvent?.(event);
    } catch (e) {
      console.error('[Helium] onAnyEvent handler threw', e);
    }
  }
}

function dispatchTypedPaywallEventHandler(event: HeliumPaywallEvent) {
  switch (event.type) {
    case 'paywallOpen':
      paywallEventHandlers?.onOpen?.({
        type: 'paywallOpen',
        triggerName: event.triggerName ?? 'unknown',
        paywallName: event.paywallName ?? 'unknown',
        paywallUnavailableReason: event.paywallUnavailableReason,
        isSecondTry: event.isSecondTry ?? false,
        loadTimeTakenMS: event.loadTimeTakenMS,
        loadingBudgetMS: event.loadingBudgetMS,
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
        paymentProcessor: event.paymentProcessor,
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
        loadTimeTakenMS: event.loadTimeTakenMS,
        loadingBudgetMS: event.loadingBudgetMS,
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
}

function dispatchEntitled(entitledEvent?: PaywallEntitledEvent) {
  const onEntitled = presentOnEntitled;
  presentOnEntitled = undefined;
  if (entitledEvent?.type === 'paywallSkipped') {
    presentOnPaywallSkip = undefined;
  }
  try {
    onEntitled?.(entitledEvent);
  } catch (e) {
    console.error('[Helium] onEntitled callback failed', e);
  }
}

function dispatchPaywallSkip(event: PaywallSkippedEvent) {
  if (event.skipReason === 'alreadyEntitled' && presentOnEntitled) {
    dispatchEntitled(event);
    return;
  }
  const onPaywallSkip = presentOnPaywallSkip;
  presentOnPaywallSkip = undefined;
  try {
    onPaywallSkip?.(event);
  } catch (e) {
    console.error('[Helium] onPaywallSkip callback failed', e);
  }
}

function handlePaywallEvent(event: HeliumPaywallEvent) {
  switch (event.type) {
    case 'paywallClose':
      if (!event.isSecondTry) {
        paywallEventHandlers = undefined;
        presentOnPaywallSkip = undefined;
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
      presentOnPaywallSkip = undefined;
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

export const getPaywallInfo = async (trigger: string): Promise<PaywallInfo | undefined> => {
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
 * Clear the custom user ID for the current user.
 */
export const clearCustomUserId = (): void => {
  try {
    HeliumBridge.setCustomUserId(null);
  } catch (e) {
    console.error('[Helium] Failed to clear custom user ID', e);
  }
};

/**
 * Returns the current custom user ID, or `null` if none has been set.
 */
export const getCustomUserId = async (): Promise<string | null> => {
  try {
    return await HeliumBridge.getCustomUserId();
  } catch (e) {
    console.error('[Helium] Failed to get custom user ID', e);
    return null;
  }
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
export const setThirdPartyAnalyticsAnonymousId = (anonymousId: string | null): void => {
  try {
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
export const hasEntitlementForPaywall = async (trigger: string): Promise<boolean | undefined> => {
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
export const resetHelium = async (options?: ResetHeliumOptions): Promise<void> => {
  paywallEventHandlers = undefined;
  presentOnPaywallUnavailable = undefined;
  presentOnEntitled = undefined;
  presentOnPaywallSkip = undefined;
  removeAllHeliumListeners();

  try {
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
  HeliumBridge.setCustomRestoreFailedStrings(customTitle, customMessage, customCloseButtonText);
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
 * Controls whether the triple-tap paywall previews gesture is enabled in DEBUG / TestFlight
 * builds for iOS and debug builds for Android.
 *
 * Defaults to `true`.
 */
export const setPaywallPreviewsEnabledInDevBuilds = (enabled: boolean): void => {
  try {
    HeliumBridge.setPaywallPreviewsAutoEnabledInDevBuilds(enabled);
  } catch (e) {
    console.error('[Helium] setPaywallPreviewsEnabledInDevBuilds error', e);
  }
};

/**
 * Stubs for automated testing (UI tests, CI, builds where StoreKit / Play Billing
 * configuration is awkward). Gate these calls behind a build-env flag so they never
 * run in production builds.
 */
export const heliumTesting = {
  /**
   * Stub purchase attempts to return the given result instead of running the real
   * purchase flow.
   */
  setPurchaseResult: (result: HeliumTransactionStatus): void => {
    try {
      HeliumBridge.setTestPurchaseResult(result);
    } catch (e) {
      console.error('[Helium] heliumTesting.setPurchaseResult error', e);
    }
  },

  /**
   * Stub restore attempts to return the given result instead of running the real
   * restore flow.
   */
  setRestoreResult: (success: boolean): void => {
    try {
      HeliumBridge.setTestRestoreResult(success);
    } catch (e) {
      console.error('[Helium] heliumTesting.setRestoreResult error', e);
    }
  },

  /**
   * Override the intro-offer eligibility check for every product.
   *
   * Important: Call this BEFORE `initialize()`.
   */
  setIntroOfferEligibility: (eligible: boolean): void => {
    try {
      HeliumBridge.setTestIntroOfferEligibility(eligible);
    } catch (e) {
      console.error('[Helium] heliumTesting.setIntroOfferEligibility error', e);
    }
  },

  /** Clear all configured test handlers. */
  reset: (): void => {
    try {
      HeliumBridge.resetTesting();
    } catch (e) {
      console.error('[Helium] heliumTesting.reset error', e);
    }
  },
};

/**
 * Forward an incoming URL (deep link / universal link) to Helium so the SDK
 * can react to external web checkout redirects.
 *
 * This is not required, but encouraged for smoother post-purchase experience.
 *
 * Resolves to which configured redirect URL the user came back through, or `undefined`
 * if the URL was not recognized as a Helium web checkout redirect (including on Android,
 * or when `url` is null).
 */
export const heliumHandleURL = async (
  url: string | null
): Promise<HeliumCheckoutRedirectType | undefined> => {
  if (Platform.OS !== 'ios' || !url) {
    return undefined;
  }
  try {
    const result = await HeliumBridge.heliumHandleURL(url);
    return (result ?? undefined) as HeliumCheckoutRedirectType | undefined;
  } catch (e) {
    console.error('[Helium] heliumHandleURL error', e);
    return undefined;
  }
};

/**
 * iOS only. Enables External Web Checkout Flow for any Paddle or Stripe products in your
 * paywalls. If not enabled, paywalls with Paddle/Stripe products will not show. Your
 * fallback paywall/s, if provided, will show instead.
 *
 * You must provide a redirect URL so Helium knows where to send the user back after checkout,
 * whether it succeeded, was cancelled, or failed. If a user returns to the app manually
 * without the redirect URL, then the SDK will look at the latest entitlement state to
 * determine if a purchase was made.
 *
 * Register the URL as a deep link (custom scheme or universal link) and forward it to
 * `heliumHandleURL` from your URL handler.
 *
 * @param redirectURL The URL checkout redirects back to when the user is done.
 * @param paymentProcessors Which payment processors to enable. Paddle, Stripe, or both.
 *   Pass `['paddle']` or `['stripe']` if your app only uses one to skip the unused
 *   processor's entitlement network calls.
 */
function enableExternalWebCheckout(options: {
  redirectURL: string;
  paymentProcessors: WebCheckoutProcessor[];
}): void;
/**
 * @deprecated Pass `redirectURL` instead. A single redirect URL covers success, cancel, and
 * payment failure.
 */
function enableExternalWebCheckout(options: {
  successURL: string;
  cancelURL: string;
  paymentProcessors?: WebCheckoutProcessor[];
}): void;
function enableExternalWebCheckout(options: {
  redirectURL?: string;
  successURL?: string;
  cancelURL?: string;
  paymentProcessors?: WebCheckoutProcessor[];
}): void {
  const { redirectURL, successURL, cancelURL, paymentProcessors } = options;
  if (Platform.OS !== 'ios') {
    console.log('[Helium] enableExternalWebCheckout is only available on iOS');
    return;
  }
  if (paymentProcessors && paymentProcessors.length === 0) {
    console.error(
      "[Helium] enableExternalWebCheckout: paymentProcessors must not be empty. Pass ['paddle'], ['stripe'], or both."
    );
    return;
  }
  try {
    if (redirectURL !== undefined) {
      if (!redirectURL) {
        console.error('[Helium] enableExternalWebCheckout: redirectURL must not be empty.');
        return;
      }
      HeliumBridge.enableExternalWebCheckout(redirectURL, paymentProcessors);
      return;
    }
    if (!successURL || !cancelURL) {
      console.error(
        '[Helium] enableExternalWebCheckout: successURL and cancelURL must not be empty.'
      );
      return;
    }
    HeliumBridge.enableExternalWebCheckoutSuccessAndCancel(
      successURL,
      cancelURL,
      paymentProcessors
    );
  } catch (e) {
    console.error('[Helium] enableExternalWebCheckout error', e);
  }
}

export { enableExternalWebCheckout };

/**
 * iOS only. Disables External Web Checkout Flow. Paywalls with Paddle or Stripe products
 * will not show. Your fallback paywall/s, if provided, will show instead.
 *
 * NOTE - if you have existing Paddle/Stripe customers, Helium will attempt to continue
 * respecting their entitlements but is not guaranteed to do so.
 */
export const disableExternalWebCheckout = (): void => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] disableExternalWebCheckout is only available on iOS');
    return;
  }
  try {
    HeliumBridge.disableExternalWebCheckout();
  } catch (e) {
    console.error('[Helium] disableExternalWebCheckout error', e);
  }
};

/**
 * iOS only. Allows Web Checkout paywalls (Paddle/Stripe) to show even when no custom user
 * ID has been set via `setCustomUserId`.
 *
 * By default, paywalls with Paddle or Stripe products will not show if user ID is not set.
 * Your fallback paywall/s, if provided, will show instead.
 * Set this to `true` if your app supports purchase-before-signup flows. Once
 * `setCustomUserId` is called later, Helium will automatically link the Paddle/Stripe
 * customer to that user ID.
 *
 * Warning: Use with caution. If the user purchases via web checkout and your app never sets
 * a `customUserId` (or uninstalls the app before doing so), the purchase may be
 * unrecoverable for that user. Only enable this if your app has a clear path for the user
 * to set a custom user ID post-purchase.
 *
 * Defaults to `false`.
 */
export const setAllowWebCheckoutWithoutUserId = (allow: boolean): void => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] setAllowWebCheckoutWithoutUserId is only available on iOS');
    return;
  }
  try {
    HeliumBridge.setAllowWebCheckoutWithoutUserId(allow);
  } catch (e) {
    console.error('[Helium] setAllowWebCheckoutWithoutUserId error', e);
  }
};

/**
 * iOS only. Returns `true` if the user has any active Stripe entitlement.
 */
export const hasActiveStripeEntitlement = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] hasActiveStripeEntitlement is only available on iOS');
    return false;
  }
  try {
    return await HeliumBridge.hasActiveStripeEntitlement();
  } catch (e) {
    console.error('[Helium] hasActiveStripeEntitlement error', e);
    return false;
  }
};

/**
 * iOS only. Returns `true` if the user has any active Paddle entitlement.
 */
export const hasActivePaddleEntitlement = async (): Promise<boolean> => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] hasActivePaddleEntitlement is only available on iOS');
    return false;
  }
  try {
    return await HeliumBridge.hasActivePaddleEntitlement();
  } catch (e) {
    console.error('[Helium] hasActivePaddleEntitlement error', e);
    return false;
  }
};

/**
 * iOS only. Creates a Stripe Customer Portal session and returns the portal URL.
 * The host app can open this URL in a browser or in-app webview to let the user
 * manage their subscriptions, payment methods, and invoices.
 *
 * @param returnUrl The URL Stripe redirects to after the user finishes in the portal.
 * @returns The portal session URL, or `undefined` if the session could not be created.
 */
export const createStripePortalSession = async (returnUrl: string): Promise<string | undefined> => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] createStripePortalSession is only available on iOS');
    return undefined;
  }
  try {
    return await HeliumBridge.createStripePortalSession(returnUrl);
  } catch (e) {
    console.error('[Helium] createStripePortalSession error', e);
    return undefined;
  }
};

/**
 * iOS only. Resets Stripe entitlements and clears the user ID.
 * If your app can support multiple Stripe users on the same device, call this to
 * effectively "log out" a Stripe user.
 */
export const resetStripeEntitlements = (): void => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] resetStripeEntitlements is only available on iOS');
    return;
  }
  try {
    HeliumBridge.resetStripeEntitlements();
  } catch (e) {
    console.error('[Helium] resetStripeEntitlements error', e);
  }
};

/**
 * iOS only. Creates a Paddle Customer Portal session for the current user and returns the
 * portal URL. The host app can open this URL in a browser or in-app webview to let the
 * user manage their subscriptions.
 *
 * @returns The portal session URL, or `undefined` if the session could not be created.
 * @deprecated Use getPaddleCustomerId() and pass the ID to your server to generate a
 * Paddle customer portal session instead.
 */
export const createPaddlePortalSession = async (): Promise<string | undefined> => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] createPaddlePortalSession is only available on iOS');
    return undefined;
  }
  try {
    return await HeliumBridge.createPaddlePortalSession();
  } catch (e) {
    console.error('[Helium] createPaddlePortalSession error', e);
    return undefined;
  }
};

/**
 * iOS only. Returns the Paddle customer ID for the current user, if one exists.
 *
 * Pass this ID to your server to generate a Paddle customer portal session,
 * allowing the user to manage their subscriptions.
 *
 * @returns The Paddle customer ID, or `undefined` if none has been assigned.
 */
export const getPaddleCustomerId = async (): Promise<string | undefined> => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] getPaddleCustomerId is only available on iOS');
    return undefined;
  }
  try {
    return (await HeliumBridge.getPaddleCustomerId()) ?? undefined;
  } catch (e) {
    console.error('[Helium] getPaddleCustomerId error', e);
    return undefined;
  }
};

/**
 * iOS only. Resets Paddle entitlements and clears the user ID.
 * If your app can support multiple Paddle users on the same device, call this to
 * effectively "log out" a Paddle user.
 */
export const resetPaddleEntitlements = (): void => {
  if (Platform.OS !== 'ios') {
    console.log('[Helium] resetPaddleEntitlements is only available on iOS');
    return;
  }
  try {
    HeliumBridge.resetPaddleEntitlements();
  } catch (e) {
    console.error('[Helium] resetPaddleEntitlements error', e);
  }
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
