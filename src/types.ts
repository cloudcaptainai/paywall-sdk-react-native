export type HeliumEnvironment = 'sandbox' | 'production';

export type HeliumTransactionStatus = 'purchased' | 'failed' | 'cancelled' | 'pending' | 'restored';

export type HeliumPurchaseResult = {
  status: HeliumTransactionStatus;
  /** Optional error message */
  error?: string;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
};

export type HeliumDownloadStatus =
  | 'downloadSuccess'
  | 'downloadFailure'
  | 'inProgress'
  | 'notDownloadedYet';

export type HeliumLightDarkMode = 'light' | 'dark' | 'system';

/** External web-checkout payment processors (iOS only). */
export type WebCheckoutProcessor = 'paddle' | 'stripe';

/**
 * Which of the configured external web checkout redirect URLs the user returned through.
 */
export type HeliumCheckoutRedirectType = 'success' | 'cancel' | 'paymentFailure';

/** A log event emitted by the native Helium SDK. */
export interface HeliumLogEvent {
  /** Numeric log level (1=error, 2=warn, 3=info, 4=debug, 5=trace). */
  level: number;
  /** The category/subsystem that generated this log (iOS) or tag (Android). */
  category: string;
  /** The log message (prefixed with "[Helium] "). */
  message: string;
  /** Key-value metadata associated with this log event (iOS only, empty on Android). */
  metadata: Record<string, string>;
}

/** Bridge event from the native SDK asking the host app to perform a purchase or restore. */
export type DelegateActionEvent = {
  type: 'purchase' | 'restore';
  productId?: string;
  /** Android-specific: Base plan ID for subscriptions */
  basePlanId?: string;
  /** Android-specific: Offer ID for promotional offers */
  offerId?: string;
};

// --- Purchase Configuration Types ---

/** Interface for providing custom purchase handling logic. */
export interface HeliumPurchaseConfig {
  /**
   * @deprecated Use makePurchaseIOS / makePurchaseAndroid instead for platform-specific handling.
   * This method will continue to work for backward compatibility but doesn't provide Android subscription parameters.
   */
  makePurchase?: (productId: string) => Promise<HeliumPurchaseResult>;
  /** iOS-specific purchase handler. Receives a simple product ID string. */
  makePurchaseIOS?: (productId: string) => Promise<HeliumPurchaseResult>;
  /** Android-specific purchase handler. Receives product ID and optional subscription parameters. */
  makePurchaseAndroid?: (
    productId: string,
    basePlanId?: string,
    offerId?: string
  ) => Promise<HeliumPurchaseResult>;

  restorePurchases: () => Promise<boolean>;

  /** @internal Used to identify the purchase delegate type for analytics. */
  _delegateType?: string;

  /** Called by the Helium SDK on every paywall event. */
  onHeliumEvent?: (event: HeliumPaywallEvent) => void;
}

// Helper function for creating Custom Purchase Config
export function createCustomPurchaseConfig(callbacks: {
  /** @deprecated Use makePurchaseIOS or makePurchaseAndroid instead */
  makePurchase?: (productId: string) => Promise<HeliumPurchaseResult>;
  makePurchaseIOS?: (productId: string) => Promise<HeliumPurchaseResult>;
  makePurchaseAndroid?: (
    productId: string,
    basePlanId?: string,
    offerId?: string
  ) => Promise<HeliumPurchaseResult>;
  restorePurchases: () => Promise<boolean>;
}): HeliumPurchaseConfig {
  return {
    makePurchase: callbacks.makePurchase,
    makePurchaseIOS: callbacks.makePurchaseIOS,
    makePurchaseAndroid: callbacks.makePurchaseAndroid,
    restorePurchases: callbacks.restorePurchases,
  };
}

export type HeliumPaywallLoadingConfig = {
  /**
   * Whether to show a loading state while fetching paywall configuration.
   * When true, shows a loading view for up to `loadingBudget` seconds before falling back.
   * Default: true
   */
  useLoadingState?: boolean;
  /**
   * Maximum time (in seconds) to show the loading state before displaying the fallback paywall.
   * After this timeout, the fallback view will be shown even if the paywall is still downloading.
   * Default: 7.0 seconds
   */
  loadingBudget?: number;
};

// Event handler types for per-presentation event handling
export interface PaywallEventHandlers {
  onOpen?: (event: PaywallOpenEvent) => void;
  onClose?: (event: PaywallCloseEvent) => void;
  onDismissed?: (event: PaywallDismissedEvent) => void;
  onPurchaseSucceeded?: (event: PurchaseSucceededEvent) => void;
  onOpenFailed?: (event: PaywallOpenFailedEvent) => void;
  onCustomPaywallAction?: (event: CustomPaywallActionEvent) => void;
  /** A handler that will fire for any paywall-related event. */
  onAnyEvent?: (event: HeliumPaywallEvent) => void;
}

// Typed event interfaces
export interface PaywallOpenEvent {
  type: 'paywallOpen';
  triggerName: string;
  paywallName: string;
  paywallUnavailableReason?: string;
  isSecondTry: boolean;
  loadTimeTakenMS?: number;
  loadingBudgetMS?: number;
  viewType?: 'presented' | 'embedded' | 'triggered';
}

export interface PaywallCloseEvent {
  type: 'paywallClose';
  triggerName: string;
  paywallName: string;
  isSecondTry: boolean;
}

export interface PaywallDismissedEvent {
  type: 'paywallDismissed';
  triggerName: string;
  paywallName: string;
  isSecondTry: boolean;
}

export interface PurchaseSucceededEvent {
  type: 'purchaseSucceeded';
  productId: string;
  triggerName: string;
  paywallName: string;
  isSecondTry: boolean;
  paymentProcessor?: HeliumPaymentProcessor;
}

export interface PaywallOpenFailedEvent {
  type: 'paywallOpenFailed';
  triggerName: string;
  paywallName: string;
  error: string;
  paywallUnavailableReason?: string;
  isSecondTry: boolean;
  loadTimeTakenMS?: number;
  loadingBudgetMS?: number;
}

/** Passed to `onPaywallSkip` when the paywall is intentionally not shown for a trigger. */
export interface PaywallSkippedEvent {
  type: 'paywallSkipped';
  triggerName: string;
  skipReason: PaywallSkippedReason;
}

export interface CustomPaywallActionEvent {
  type: 'customPaywallAction';
  triggerName: string;
  paywallName: string;
  actionName: string;
  params: Record<string, any>;
  isSecondTry: boolean;
}

export type HeliumPaywallEvent = {
  type:
    | 'paywallOpen'
    | 'paywallClose'
    | 'paywallDismissed'
    | 'paywallOpenFailed'
    | 'paywallSkipped'
    | 'paywallButtonPressed'
    | 'productSelected'
    | 'purchasePressed'
    | 'purchaseSucceeded'
    | 'purchaseCancelled'
    | 'purchaseFailed'
    | 'purchaseRestored'
    | 'purchaseRestoreFailed'
    | 'purchasePending'
    | 'initializeCalled'
    | 'paywallsDownloadSuccess'
    | 'paywallsDownloadError'
    | 'paywallWebViewRendered'
    | 'customPaywallAction'
    | 'userAllocated'
    | 'purchaseAlreadyEntitled';
  triggerName?: string;
  paywallName?: string;
  /**
   * @deprecated Use `paywallName` instead.
   */
  paywallTemplateName?: string;
  productId?: string;
  /**
   * @deprecated Use `productId` instead.
   */
  productKey?: string;
  buttonName?: string;
  /**
   * @deprecated Use `buttonName` instead.
   */
  ctaName?: string;
  configId?: string;
  numAttempts?: number;
  downloadTimeTakenMS?: number;
  /** Time loading state was shown for, in milliseconds. Present on `paywallOpen` / `paywallOpenFailed` when a loading state was used. */
  loadTimeTakenMS?: number;
  /** Loading budget for the trigger, in milliseconds. Present on `paywallOpen` / `paywallOpenFailed`. */
  loadingBudgetMS?: number;
  /** Total time from config fetch start to completion, in milliseconds. Present on `paywallsDownloadSuccess` / `paywallsDownloadError`. */
  totalInitializeTimeMS?: number;
  webviewRenderTimeTakenMS?: number;
  imagesDownloadTimeTakenMS?: number;
  fontsDownloadTimeTakenMS?: number;
  bundleDownloadTimeMS?: number;
  dismissAll?: boolean;
  isSecondTry?: boolean;
  error?: string;
  /**
   * @deprecated Use `error` instead.
   */
  errorDescription?: string;
  /**
   * Unix timestamp in seconds
   */
  timestamp?: number;
  paywallUnavailableReason?: string;
  /** Reason the paywall was skipped. Present on `paywallSkipped` events. */
  skipReason?: PaywallSkippedReason;
  customPaywallActionName?: string;
  customPaywallActionParams?: Record<string, any>;
  /** Transaction ID for a successful purchase. */
  canonicalJoinTransactionId?: string;
  /** Payment processor that completed a successful purchase. Present on `purchaseSucceeded` events. */
  paymentProcessor?: HeliumPaymentProcessor;
  /** How an existing entitlement was surfaced. Present on `purchaseRestored` events (iOS). */
  restoreOrigin?: PurchaseRestoredOrigin;
};

/** Identifies which payment processor completed a purchase. */
export type HeliumPaymentProcessor = 'appStore' | 'stripe' | 'paddle';

/** Reason a paywall was skipped (not shown) for a trigger. `unknown` only appears if the native payload carried no reason. */
export type PaywallSkippedReason = 'targetingHoldout' | 'alreadyEntitled' | 'unknown';

/**
 * The entitling event passed to `onEntitled`, identifying how the user became (or was found to be) entitled.
 * - `purchaseSucceeded`: a new purchase completed successfully.
 * - `purchaseRestored`: an existing entitlement was surfaced via restore.
 * - `purchaseAlreadyEntitled`: a purchase attempt resolved to an entitlement the user already had. (iOS only)
 * - `paywallSkipped`: the paywall was not shown because the user is already entitled
 *   (requires `dontShowIfAlreadyEntitled`).
 */
export type PaywallEntitledEvent = HeliumPaywallEvent & {
  type: 'purchaseSucceeded' | 'purchaseRestored' | 'purchaseAlreadyEntitled' | 'paywallSkipped';
};

/**
 * How an existing entitlement was surfaced on a `purchaseRestored` event.
 * - `restorePurchases`: user tapped the "Restore Purchases" button.
 * - `duringPurchase`: a purchase action resolved as a restoration (e.g. StoreKit returned `.restored`,
 *   or a web pre-checkout entitlement check found the user already owned the product).
 * - `detectedPostWebCheckout`: entitlement was passively observed after returning from an
 *   external web checkout success redirect.
 */
export type PurchaseRestoredOrigin =
  | 'restorePurchases'
  | 'duringPurchase'
  | 'detectedPostWebCheckout';

export type PresentUpsellParams = {
  /** The trigger configured in the Helium dashboard (https://app.tryhelium.com/workflows). */
  triggerName: string;
  /** Optional. Handlers for this presentation's paywall lifecycle events (open, close, dismiss, purchase,
   * open failure, custom actions). Replaced by the next `presentUpsell` call. */
  eventHandlers?: PaywallEventHandlers;
  /** Optional. Custom traits to send to the paywall. User traits are automatically included as paywall traits,
   * as is "trigger"; on duplicate keys the value from `customPaywallTraits` wins. */
  customPaywallTraits?: Record<string, any>;
  /** Optional. If true, the paywall is skipped when the user already has an active entitlement for a product in the
   * paywall. Defaults to false, which is right for most paywalls: user-initiated paywalls (e.g. "Upgrade to Premium")
   * and onboarding paywalls should almost always show, and entitled users can still use "Restore Purchases". Enable it
   * only where a paying user must never see a paywall, such as one presented automatically on app open. If your app
   * already tracks entitlement, keep it false and use your existing entitlement logic instead.
   * See https://docs.tryhelium.com/sdk/quickstart-react-native#checking-subscription-status-%26-entitlements
   */
  dontShowIfAlreadyEntitled?: boolean;
  /** Optional. Android only. If true, disables the system back button/gesture while the paywall is displayed. Defaults to false. */
  androidDisableSystemBackNavigation?: boolean;
  /** Optional. Called with the entitling event upon purchase success (`purchaseSucceeded`),
   * purchase restore (`purchaseRestored`), or a purchase attempt resolving to an existing
   * entitlement (`purchaseAlreadyEntitled`, iOS only) — in these cases it is called when the paywall closes.
   * If you set `dontShowIfAlreadyEntitled` to true, this handler is also called immediately with a
   * `paywallSkipped` event when the paywall is not shown to users who already have entitlement
   * for a product in the paywall.
   */
  onEntitled?: (event?: PaywallEntitledEvent) => void;
  /** Optional. Called when the paywall is intentionally not shown for this trigger — a targeting holdout
   * configured in your workflow (`skipReason` = `targetingHoldout`), or, when `dontShowIfAlreadyEntitled` is true,
   * an already-entitled user (`skipReason` = `alreadyEntitled`). For already-entitled skips `onEntitled` takes
   * precedence: `onPaywallSkip` is only called for that case when `onEntitled` is not provided.
   * Not called for errors — see `onPaywallUnavailable`.
   */
  onPaywallSkip?: (event: PaywallSkippedEvent) => void;
  /** Optional. Called if the desired paywall and fallback paywall did not show due to an unexpected error.
   * This is uncommon, but best practice to handle it just in case.
   * See https://docs.tryhelium.com/guides/fallback-bundle */
  onPaywallUnavailable?: () => void;
};

// --- Main Helium Configuration ---
/**
 * All fields on this config — including `purchaseConfig` and `onHeliumPaywallEvent` —
 * are captured at `initialize()` time. Mutating them on the same object after
 * initialize, or passing a new config to a later `initialize()` call, has no effect:
 * `initialize` is idempotent. To swap callbacks or purchase handling, call
 * `resetHelium()` followed by `initialize()` with the new config.
 */
export interface HeliumConfig {
  /** Your Helium API Key */
  apiKey: string;
  /**
   * Configuration for handling purchases. Can be custom functions or a pre-built handler config.
   * If not provided, Helium will handle purchases for you.
   */
  purchaseConfig?: HeliumPurchaseConfig;
  /** Callback for receiving all Helium paywall events. */
  onHeliumPaywallEvent?: (event: HeliumPaywallEvent) => void;

  // Optional configurations
  /** Fallback bundle in the rare situation that paywall is not ready to be shown. Highly recommended. See docs at https://docs.tryhelium.com/guides/fallback-bundle#react-native */
  fallbackBundle?: object;
  /** Configure loading behavior for paywalls that are mid-download. */
  paywallLoadingConfig?: HeliumPaywallLoadingConfig;
  /** Environment to use for Android. (iOS auto-detects this.)
   *  If not specified, Android environment will be "sandbox" if app is a debug build, "production" otherwise.
   *  Recommended to pass in "sandbox" for QA builds that behave like a production build but are actually just for testing.
   */
  environment?: HeliumEnvironment;
  customUserId?: string;
  customAPIEndpoint?: string;
  customUserTraits?: Record<string, any>;
  revenueCatAppUserId?: string;
  /**
   * Set consumable product IDs for Android.
   * These IDs will be used to identify consumable products in the Play Store
   * and this is only respected if no custom purchaseConfig is supplied.
   * This is only relevant on Android and is a no-op on other platforms.
   */
  androidConsumableProductIds?: string[];
}

/** Shape sent across the native bridge to `initialize`. */
export interface NativeHeliumConfig {
  apiKey: string;
  customUserId?: string;
  customAPIEndpoint?: string;
  customUserTraits?: Record<string, any>;
  revenueCatAppUserId?: string;
  fallbackBundleUrlString?: string;
  fallbackBundleString?: string;
  paywallLoadingConfig?: HeliumPaywallLoadingConfig;
  useDefaultDelegate?: boolean;
  environment?: string;
  wrapperSdkVersion?: string;
  delegateType?: string;
  androidConsumableProductIds?: string[];
}

export interface ResetHeliumOptions {
  /** Whether to clear custom user traits. Defaults to `true`. */
  clearUserTraits?: boolean;
  /** Whether to clear experiment allocations. Defaults to `false`. */
  clearExperimentAllocations?: boolean;
}

// --- Other Existing Types ---

export interface PaywallInfo {
  paywallTemplateName: string;
  shouldShow: boolean;
}

export const HELIUM_CTA_NAMES = {
  SCHEDULE_CALL: 'schedule_call',
  SUBSCRIBE_BUTTON: 'subscribe_button',
} as const;
