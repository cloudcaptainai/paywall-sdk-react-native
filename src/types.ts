export type HeliumEnvironment = 'sandbox' | 'production';

export type HeliumTransactionStatus =
  | 'purchased'
  | 'failed'
  | 'cancelled'
  | 'pending'
  | 'restored';

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

export type TriggerLoadingConfig = {
  /** Whether to show loading state for this trigger. Set to nil to use the global `useLoadingState` setting. */
  useLoadingState?: boolean;
  /** Maximum seconds to show loading for this trigger. Set to nil to use the global `loadingBudget` setting. */
  loadingBudget?: number;
};

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
  /**
   * Optional per-trigger loading configuration overrides.
   * Use this to customize loading behavior for specific triggers.
   * Keys are trigger names, values are TriggerLoadingConfig instances.
   * Example: Disable loading for "onboarding" trigger while keeping it for others.
   */
  perTriggerLoadingConfig?: Record<string, TriggerLoadingConfig>;
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
  isSecondTry: boolean;
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
}

export interface PaywallOpenFailedEvent {
  type: 'paywallOpenFailed';
  triggerName: string;
  paywallName: string;
  error: string;
  paywallUnavailableReason?: string;
  isSecondTry: boolean;
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
    | 'initializeStart'
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
  customPaywallActionName?: string;
  customPaywallActionParams?: Record<string, any>;
  /** Transaction ID for a successful purchase. */
  canonicalJoinTransactionId?: string;
};

export type PresentUpsellParams = {
  triggerName: string;
  eventHandlers?: PaywallEventHandlers;
  customPaywallTraits?: Record<string, any>;
  /** Optional. If true, the paywall will not be shown if the user already has an entitlement for a product in the paywall. */
  dontShowIfAlreadyEntitled?: boolean;
  /** Optional. Android only. If true, disables the system back button/gesture while the paywall is displayed. Defaults to false. */
  androidDisableSystemBackNavigation?: boolean;
  /** Optional. Called upon purchase success or purchase restore.
   * If you set `dontShowIfAlreadyEntitled` to true, this handler will also be called when paywall not shown
   * to users who already have entitlement for a product in the paywall.
   */
  onEntitled?: () => void;
  /** Optional. Called if desired paywall and fallback paywall did not show for any reason.
   * This is uncommon, but best practice to handle it just in case.
   * See https://docs.tryhelium.com/guides/fallback-bundle */
  onPaywallUnavailable?: () => void;
};

// --- Main Helium Configuration ---
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

/** Shape sent across the native bridge to initialize/setupCore. */
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

export interface HeliumUpsellViewProps {
  trigger: string;
  style?: any;
}

export interface PaywallInfo {
  paywallTemplateName: string;
  shouldShow: boolean;
}

export const HELIUM_CTA_NAMES = {
  SCHEDULE_CALL: 'schedule_call',
  SUBSCRIBE_BUTTON: 'subscribe_button',
};
