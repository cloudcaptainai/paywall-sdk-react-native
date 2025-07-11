import { findNodeHandle, View, requireNativeComponent } from 'react-native';
import React, {
  createRef,
  useEffect,
  useState,
  createContext,
  useContext,
} from 'react';
import type { HeliumConfig, HeliumUpsellViewProps, HeliumDownloadStatus } from './types';

// const { HeliumBridge } = NativeModules;
import HeliumBridge from './specs/NativeHeliumBridge';

// const heliumEventEmitter = new NativeEventEmitter(HeliumBridge);

// Register the native component once at module level
// This ensures it's only registered once, even during hot reloading
export const NativeHeliumUpsellView = requireNativeComponent<HeliumUpsellViewProps>('HeliumUpsellView');

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
let setDownloadStatusRef: ((status: HeliumDownloadStatus) => void) | null = null;
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
  fallbackView?: React.ComponentType;
}

// Create a ref to store the fallback view reference
const fallbackRef = createRef<View>();
// Store a reference to the fallback view component
let FallbackViewComponent: React.ComponentType | null = null;

// Provider component to be rendered at the app root
export const HeliumProvider = ({ children, fallbackView }: HeliumProviderProps) => {
  // TODO - deprecate fallbackView (and maybe HeliumProvider too?)
  if (fallbackView) {
    console.warn('HeliumProvider: fallbackView is deprecated. Use onFallback passed to presentUpsell instead.');
  }
  const FallbackView = (() => null);
  // Add state for download status
  const [downloadStatus, setDownloadStatus] = useState<HeliumDownloadStatus>('notStarted');

  // Store the setter in the ref so it can be accessed outside of components
  useEffect(() => {
    setDownloadStatusRef = setDownloadStatus;
    // Store the fallback view component for later use
    FallbackViewComponent = FallbackView;
  }, [setDownloadStatus, FallbackView]);

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
      <View 
        ref={fallbackRef}
        collapsable={false}
        style={{ 
          display: 'none'
        }}
      >
        <FallbackView />
      </View>
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

  const viewTag = findNodeHandle(fallbackRef.current);
  if (!viewTag) {
    throw new Error('Failed to get fallback view reference. Make sure HeliumProvider is mounted with a fallback view.');
  }

  // const purchaseHandler = {
  //   makePurchase: config.purchaseConfig.makePurchase,
  //   restorePurchases: config.purchaseConfig.restorePurchases,
  // };

  // Update download status to inProgress
  updateDownloadStatus('inProgress');

  // Set up event listeners
  // heliumEventEmitter.addListener(
  //   'helium_paywall_event',
  //   (event: any) => {
  //     // Handle download status events
  //     if (event.type === 'paywallsDownloadSuccess') {
  //       updateDownloadStatus('success');
  //     } else if (event.type === 'paywallsDownloadError') {
  //       updateDownloadStatus('failed');
  //     }
  //     // Handle fallback view visibility
  //     else if (event.type === 'paywallOpen' && event.paywallTemplateName === 'Fallback') {
  //       if (fallbackRef.current) {
  //         fallbackRef.current.setNativeProps({
  //           style: { display: 'flex' }
  //         });
  //       }
  //     } else if (event.type === 'paywallClose' && event.paywallTemplateName === 'Fallback') {
  //       if (fallbackRef.current) {
  //         fallbackRef.current.setNativeProps({
  //           style: { display: 'none' }
  //         });
  //       }
  //     }
  //
  //     // Forward all events to the callback provided in config
  //     config.onHeliumPaywallEvent(event);
  //   }
  // );

  // Set up purchase event listener using the determined handler
  // heliumEventEmitter.addListener(
  //   'helium_make_purchase',
  //   async (event: { productId: string; transactionId: string }) => {
  //     const result = await purchaseHandler.makePurchase(event.productId);
  //     HeliumBridge.handlePurchaseResponse({
  //       transactionId: event.transactionId,
  //       status: result.status,
  //       error: result.error
  //     });
  //   }
  // );

  // Set up restore purchases event listener using the determined handler
  // heliumEventEmitter.addListener(
  //   'helium_restore_purchases',
  //   async (event: { transactionId: string }) => {
  //     const success = await purchaseHandler.restorePurchases();
  //     // HeliumBridge.handleRestoreResponse({
  //     //   transactionId: event.transactionId,
  //     //   status: success ? 'restored' : 'failed'
  //     // });
  //   }
  // );

  HeliumBridge.initialize(
    {
      apiKey: config.apiKey,
      fallbackPaywall: viewTag,
      triggers: config.triggers || [],
      customUserId: config.customUserId,
      customAPIEndpoint: config.customAPIEndpoint,
      revenueCatAppUserId: config.revenueCatAppUserId,
    }
  );

  // Mark as initialized after successful initialization
  isInitialized = true;
};

// Update the other methods to be synchronous
export const presentUpsell = ({
  triggerName,
}: {
  triggerName: string;
  onFallback?: () => void;
}) => {
  HeliumBridge.presentUpsell(triggerName);

  // const downloadStatus = getDownloadStatus();
  // HeliumBridge.getFetchedTriggerNames((triggerNames: string[]) => {
  //   if (!triggerNames.includes(triggerName) || downloadStatus !== 'success') {
  //     console.log(
  //       `Helium trigger "${triggerName}" not found or download status not successful. Status:`,
  //       downloadStatus
  //     );
  //     onFallback?.();
  //     HeliumBridge.fallbackOpenOrCloseEvent(triggerName, true, 'presented');
  //     return;
  //   }
  //
  //   try {
  //     HeliumBridge.presentUpsell(triggerName);
  //   } catch (error) {
  //     console.log('Helium present error', error);
  //     onFallback?.();
  //     HeliumBridge.fallbackOpenOrCloseEvent(triggerName, true, 'presented');
  //   }
  // });
};

export const hideUpsell = () => {
  // HeliumBridge.hideUpsell();
};

export const hideAllUpsells = () => {
  // HeliumBridge.hideAllUpsells();
};

// Update the UpsellView component to handle the style prop
export const UpsellView: React.FC<HeliumUpsellViewProps & {
  fallbackViewProps?: Record<string, any>;
  fallbackViewWrapperStyles?: Record<string, any>;
}> = ({ trigger, fallbackViewProps, fallbackViewWrapperStyles }) => {
  const { downloadStatus } = useHelium();

  const showFallback = downloadStatus === 'notStarted' ||
    downloadStatus === 'inProgress' ||
    downloadStatus === 'failed';

  // useEffect(() => {
  //   if (showFallback && FallbackViewComponent) {
  //     HeliumBridge.fallbackOpenOrCloseEvent(trigger, true, 'embedded');
  //   }
  //   return () => {
  //     if (showFallback && FallbackViewComponent) {
  //       HeliumBridge.fallbackOpenOrCloseEvent(trigger, false, 'embedded');
  //     }
  //   };
  // }, [showFallback, trigger]);

  // If download status is notStarted or inProgress, we haven't fully initialized yet
  // In this case, we should render the fallback view
  if (showFallback) {
    // If we have a fallback view component, render it
    if (FallbackViewComponent) {
      return (
        <View style={fallbackViewWrapperStyles}>
          <FallbackViewComponent {...fallbackViewProps} />
        </View>
      );
    }
    
    return null;
  }
  
  // Use NativeHeliumUpsellView directly
  return <NativeHeliumUpsellView trigger={trigger} />;
};

export const HELIUM_CTA_NAMES = {
  SCHEDULE_CALL: 'schedule_call',
  SUBSCRIBE_BUTTON: 'subscribe_button',
}
