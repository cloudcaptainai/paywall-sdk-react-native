import { findNodeHandle, NativeModules, View, NativeEventEmitter, requireNativeComponent } from 'react-native';
import React, { createRef, useEffect, useState, createContext, useContext } from 'react';
import type { HeliumCallbacks, HeliumConfig, HeliumUpsellViewProps, HeliumDownloadStatus } from './types';

const { HeliumBridge } = NativeModules;
const heliumEventEmitter = new NativeEventEmitter(HeliumBridge);

// Register the native component once at module level
// This ensures it's only registered once, even during hot reloading
export const NativeHeliumUpsellView = requireNativeComponent<HeliumUpsellViewProps>('HeliumUpsellView');

let isProviderMounted = false;
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

// Create a context for the download status
interface HeliumContextType {
  downloadStatus: HeliumDownloadStatus;
  setDownloadStatus: (status: HeliumDownloadStatus) => void;
}

const HeliumContext = createContext<HeliumContextType | undefined>(undefined);

// Create a ref to store the context setter
let setDownloadStatusRef: ((status: HeliumDownloadStatus) => void) | null = null;

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
  fallbackView: React.ComponentType;
}

// Create a ref to store the fallback view reference
const fallbackRef = createRef<View>();
// Store a reference to the fallback view component
let FallbackViewComponent: React.ComponentType | null = null;

// Provider component to be rendered at the app root
export const HeliumProvider = ({ children, fallbackView: FallbackView }: HeliumProviderProps) => {
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
          display: 'none' // Initially hidden
        }}
      >
        <FallbackView />
      </View>
      {children}
    </HeliumContext.Provider>
  );
};

// Update initialize to accept config
export const initialize = async (heliumCallbacks: HeliumCallbacks, config: Partial<HeliumConfig> = {}) => {
  // Wait for the provider to be mounted if it's not already
  if (!isProviderMounted) {
    await providerMountedPromise;
  }

  const viewTag = findNodeHandle(fallbackRef.current);
  if (!viewTag) {
    throw new Error('Failed to get fallback view reference. Make sure HeliumProvider is mounted with a fallback view.');
  }

  // Update download status to inProgress
  if (setDownloadStatusRef) {
    setDownloadStatusRef('inProgress');
  }

  // Set up event listeners
  heliumEventEmitter.addListener(
    'helium_paywall_event',
    (event: any) => {
      // Handle download status events
      if (event.type === 'paywallsDownloadSuccess' && setDownloadStatusRef) {
        setDownloadStatusRef('success');
      } else if (event.type === 'paywallsDownloadError' && setDownloadStatusRef) {
        setDownloadStatusRef('failed');
      } 
      // Handle fallback view visibility
      else if (event.type === 'paywallOpen' && event.paywallTemplateName === 'Fallback') {
        if (fallbackRef.current) {
          fallbackRef.current.setNativeProps({
            style: { display: 'flex' }
          });
        }
      } else if (event.type === 'paywallClose' && event.paywallTemplateName === 'Fallback') {
        if (fallbackRef.current) {
          fallbackRef.current.setNativeProps({
            style: { display: 'none' }
          });
        }
      }
      
      // Forward all events to the callback
      heliumCallbacks.onHeliumPaywallEvent(event);
    }
  );

  // Set up purchase event listener
  heliumEventEmitter.addListener(
    'helium_make_purchase',
    async (event: { productId: string; transactionId: string }) => {
      const status = await heliumCallbacks.makePurchase(event.productId);
      HeliumBridge.handlePurchaseResponse({
        transactionId: event.transactionId,
        status: status
      });
    }
  );

  // Set up restore purchases event listener
  heliumEventEmitter.addListener(
    'helium_restore_purchases',
    async (event: { transactionId: string }) => {
      const success = await heliumCallbacks.restorePurchases();
      HeliumBridge.handleRestoreResponse({
        transactionId: event.transactionId,
        status: success ? 'restored' : 'failed'
      });
    }
  );

  // Initialize the bridge with merged config
  HeliumBridge.initialize(
    { 
      apiKey: config.apiKey,
      fallbackPaywall: viewTag,
      triggers: config.triggers || [],
      customUserId: config.customUserId || null,
      customAPIEndpoint: config.customAPIEndpoint || null,
      customUserTraits: config.customUserTraits || {
        "exampleUserTrait": "test_value"
      }
    },
    {}
  );
};

// Update the other methods to be synchronous
export const presentUpsell = (triggerName: string) => {
  HeliumBridge.presentUpsell(triggerName);
};

export const hideUpsell = () => {
  HeliumBridge.hideUpsell();
};

// Update the UpsellView component to handle the style prop
export const UpsellView: React.FC<HeliumUpsellViewProps & {
  fallbackViewProps?: Record<string, any>;
  fallbackViewWrapperStyles?: Record<string, any>;
}> = ({ trigger, fallbackViewProps, fallbackViewWrapperStyles }) => {
  const { downloadStatus } = useHelium();
  
  // If download status is notStarted or inProgress, we haven't fully initialized yet
  // In this case, we should render the fallback view
  if (downloadStatus === 'notStarted' || downloadStatus === 'inProgress' || downloadStatus === 'failed') {
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