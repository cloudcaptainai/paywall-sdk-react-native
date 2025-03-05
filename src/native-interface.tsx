import { findNodeHandle, NativeModules, View, NativeEventEmitter, requireNativeComponent } from 'react-native';
import React, { createRef, useEffect } from 'react';
import type { HeliumCallbacks, HeliumConfig, HeliumUpsellViewProps } from './types';

const { HeliumBridge } = NativeModules;
const heliumEventEmitter = new NativeEventEmitter(HeliumBridge);

let isProviderMounted = false;

// Move NativeHeliumUpsellView to a singleton pattern
let NativeHeliumUpsellView: any = null;
const getNativeHeliumUpsellView = () => {
  if (!NativeHeliumUpsellView) {
    NativeHeliumUpsellView = requireNativeComponent<HeliumUpsellViewProps>('HeliumUpsellView');
  }
  return NativeHeliumUpsellView;
};

interface HeliumProviderProps {
  children: React.ReactNode;
  fallbackView: React.ComponentType;
}

// Create a ref to store the fallback view reference
const fallbackRef = createRef<View>();

// Provider component to be rendered at the app root
export const HeliumProvider = ({ children, fallbackView: FallbackView }: HeliumProviderProps) => {

  useEffect(() => {
    isProviderMounted = true;
    return () => {
      isProviderMounted = false;
    };
  }, []);

  return (
    <>
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
    </>
  );
};

// Update initialize to accept config
export const initialize = (heliumCallbacks: HeliumCallbacks, config: Partial<HeliumConfig> = {}) => {
  if (!isProviderMounted) {
    throw new Error('HeliumProvider is not mounted. Please wrap your app with HeliumProvider.');
  }

  const viewTag = findNodeHandle(fallbackRef.current);
  if (!viewTag) {
    throw new Error('Failed to get fallback view reference. Make sure HeliumProvider is mounted with a fallback view.');
  }

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

  // Set up paywall event listener
  heliumEventEmitter.addListener(
    'helium_paywall_event',
    (event: any) => {
      
      if (event.type === 'paywallOpen' && event.paywallTemplateName === 'Fallback') {
        // Update fallback view visibility if the ref exists
        if (fallbackRef.current) {
          fallbackRef.current.setNativeProps({
            style: { display: 'flex' }
          });
        }
      } else if (event.type === 'paywallClose' && event.paywallTemplateName === 'Fallback') {
        // Update fallback view visibility if the ref exists
        if (fallbackRef.current) {
          fallbackRef.current.setNativeProps({
            style: { display: 'none' }
          });
        }
      } 
      heliumCallbacks.onHeliumPaywallEvent(event);
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
export const UpsellView: React.FC<HeliumUpsellViewProps> = ({ trigger, style }) => {
  const NativeView = getNativeHeliumUpsellView();
  return (
    <NativeView 
      trigger={trigger}
      style={[{ flex: 1 }, style]}
    />
  );
};

export const HELIUM_CTA_NAMES = {
  SCHEDULE_CALL: 'schedule_call',
  SUBSCRIBE_BUTTON: 'subscribe_button',
}