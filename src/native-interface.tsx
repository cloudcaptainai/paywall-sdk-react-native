import {
  NativeModules,
  NativeEventEmitter,
  requireNativeComponent,
} from 'react-native';
import React, { useEffect, useState, createContext, useContext } from 'react';
import type {
  HeliumConfig,
  HeliumUpsellViewProps,
  HeliumDownloadStatus,
  PaywallInfo,
  PresentUpsellParams,
  PaywallEventHandlers,
  HeliumPaywallEvent,
} from './types';

const { HeliumBridge } = NativeModules;
const heliumEventEmitter = new NativeEventEmitter(HeliumBridge);

// Register the native component once at module level
// This ensures it's only registered once, even during hot reloading
export const NativeHeliumUpsellView =
  requireNativeComponent<HeliumUpsellViewProps>('HeliumUpsellView');

let isProviderMounted = false;
// Add a flag to track if initialization has occurred
let isInitialized = false;
// Add a promise to track when the provider is mounted
let providerMountedPromise: Promise<void>;
let resolveProviderMounted: () => void;

// Initialize the promise
providerMountedPromise = new Promise<void>((resolve) => {
  resolveProviderMounted = resolve;
  // If provider is already mounted, resolve immediately
  if (isProviderMounted) {
    resolve();
  }
});

// Add module-level download status tracking
let globalDownloadStatus: HeliumDownloadStatus = 'notStarted';
export const getDownloadStatus = () => globalDownloadStatus;

// Create a context for the download status
interface HeliumContextType {
  downloadStatus: HeliumDownloadStatus;
  setDownloadStatus: (status: HeliumDownloadStatus) => void;
}

const HeliumContext = createContext<HeliumContextType | undefined>(undefined);

// Update the setter ref to also update global status
let setDownloadStatusRef: ((status: HeliumDownloadStatus) => void) | null =
  null;
const updateDownloadStatus = (status: HeliumDownloadStatus) => {
  globalDownloadStatus = status;
  setDownloadStatusRef?.(status);
};

// Hook to use the Helium context
export const useHelium = () => {
  const context = useContext(HeliumContext);
  if (!context) {
    throw new Error('useHelium must be used within a HeliumProvider');
  }
  return context;
};

interface HeliumProviderProps {
  children: React.ReactNode;
}

// Provider component to be rendered at the app root
export const HeliumProvider = ({ children }: HeliumProviderProps) => {
  // Add state for download status
  const [downloadStatus, setDownloadStatus] =
    useState<HeliumDownloadStatus>('notStarted');

  // Store the setter in the ref so it can be accessed outside of components
  useEffect(() => {
    setDownloadStatusRef = setDownloadStatus;
  }, [setDownloadStatus]);

  useEffect(() => {
    isProviderMounted = true;
    // Resolve the promise when the provider is mounted
    resolveProviderMounted();
    return () => {
      isProviderMounted = false;
      setDownloadStatusRef = null;
    };
  }, []);

  return (
    <HeliumContext.Provider value={{ downloadStatus, setDownloadStatus }}>
      {children}
    </HeliumContext.Provider>
  );
};

// Update initialize to accept full config
export const initialize = async (config: HeliumConfig) => {
  // Early return if already initialized
  if (isInitialized) {
    return;
  }

  // Wait for the provider to be mounted if it's not already
  if (!isProviderMounted) {
    await providerMountedPromise;
  }

  const purchaseHandler = {
    makePurchase: config.purchaseConfig.makePurchase,
    restorePurchases: config.purchaseConfig.restorePurchases,
  };

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

      // Forward all events to the callback provided in config
      config.onHeliumPaywallEvent(event);
    }
  );

  // Set up paywall event handlers listener
  heliumEventEmitter.addListener(
    'paywallEventHandlers',
    (event: HeliumPaywallEvent) => {
      callPaywallEventHandlers(event);
    }
  );

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
      customUserTraits:
        config.customUserTraits == null ? {} : config.customUserTraits,
      revenueCatAppUserId: config.revenueCatAppUserId,
      fallbackBundleUrlString: fallbackBundleUrlString,
      fallbackBundleString: fallbackBundleString,
      paywallLoadingConfig: config.paywallLoadingConfig,
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
}: PresentUpsellParams) => {
  HeliumBridge.canPresentUpsell(
    triggerName,
    (canPresent: boolean, reason: string) => {
      if (!canPresent) {
        console.log(
          `[Helium] Cannot present trigger "${triggerName}". Reason: ${reason}`
        );
        onFallback?.();
        HeliumBridge.fallbackOpenOrCloseEvent(triggerName, true, 'presented');
        return;
      }

      try {
        paywallEventHandlers = eventHandlers;
        presentOnFallback = onFallback;
        HeliumBridge.presentUpsell(triggerName, customPaywallTraits || null);
      } catch (error) {
        console.log('[Helium] Present error', error);
        paywallEventHandlers = undefined;
        presentOnFallback = undefined;
        onFallback?.();
        HeliumBridge.fallbackOpenOrCloseEvent(triggerName, true, 'presented');
      }
    }
  );
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
        if (!event.isSecondTry) {
          paywallEventHandlers = undefined;
        }
        presentOnFallback = undefined;
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
          productId: event.productKey ?? 'unknown',
          triggerName: event.triggerName ?? 'unknown',
          paywallName: event.paywallName ?? 'unknown',
          isSecondTry: event.isSecondTry ?? false,
        });
        break;
      case 'paywallSkipped':
        paywallEventHandlers = undefined;
        presentOnFallback = undefined;
        break;
      case 'paywallOpenFailed':
        paywallEventHandlers = undefined;
        presentOnFallback?.();
        presentOnFallback = undefined;
        break;
    }
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
    }
  });
};

export const HELIUM_CTA_NAMES = {
  SCHEDULE_CALL: 'schedule_call',
  SUBSCRIBE_BUTTON: 'subscribe_button',
};
