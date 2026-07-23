import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import type { HeliumPaywallEvent } from '@tryheliumai/paywall-sdk-react-native';
import {
  initialize,
  presentUpsell,
  setCustomUserId,
  clearCustomUserId,
  getCustomUserId,
  getDownloadStatus,
  getPaywallInfo,
  hasAnyActiveSubscription,
  hasAnyEntitlement,
  hasEntitlementForPaywall,
  hasActiveStripeEntitlement,
  hasActivePaddleEntitlement,
  heliumTesting,
  enableExternalWebCheckout,
  disableExternalWebCheckout,
  setAllowWebCheckoutWithoutUserId,
  resetStripeEntitlements,
  resetPaddleEntitlements,
  heliumHandleURL,
  createStripePortalSession,
  createPaddlePortalSession,
  getPaddleCustomerId,
  resetHelium,
} from '@tryheliumai/paywall-sdk-react-native';

// Values come from .env (see .env.example). Placeholders only apply if the
// env var is missing — fine for building the app but all Helium calls will
// fail until you fill them in.
const HELIUM_API_KEY = process.env.EXPO_PUBLIC_HELIUM_API_KEY ?? 'REPLACE_ME';
const TRIGGER_NAME = process.env.EXPO_PUBLIC_HELIUM_TRIGGER ?? 'REPLACE_ME';

// Web checkout success/cancel redirect target. Must use a URL scheme the app
// registers, or the post-purchase return cannot deep-link back into the app.
const RETURN_URL = 'heliumexample://openapp';

const isIOS = Platform.OS === 'ios';

function initHelium(onEvent: (event: HeliumPaywallEvent) => void) {
  if (isIOS) {
    // Must be called before initialize(). Omitting paymentProcessors enables all
    // (Paddle + Stripe), so any web-checkout paywall in the org can show.
    enableExternalWebCheckout({ successURL: RETURN_URL, cancelURL: RETURN_URL });
  }
  initialize({ apiKey: HELIUM_API_KEY, onHeliumPaywallEvent: onEvent });
}

export default function App() {
  const [trigger, setTrigger] = useState(TRIGGER_NAME);
  const [dontShowIfAlreadyEntitled, setDontShowIfAlreadyEntitled] = useState(false);
  const [disableBackNavigation, setDisableBackNavigation] = useState(false);
  const [customUserId, setCustomUserIdState] = useState<string | null>(null);
  const [webCheckoutEnabled, setWebCheckoutEnabled] = useState(true);
  const [allowCheckoutWithoutUserId, setAllowCheckoutWithoutUserId] = useState(false);
  const [sdkState, setSdkState] = useState<string>('(tap refresh)');
  const [purchaseStub, setPurchaseStub] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const eventLog = useRef<string[]>([]);

  useEffect(() => {
    const recordEvent = (event: HeliumPaywallEvent) => {
      eventLog.current = [event.type, ...eventLog.current].slice(0, 8);
      setEvents(eventLog.current);
    };
    initHelium(recordEvent);

    // Forward incoming deep links so the SDK can react to web checkout
    // redirects (returns which configured URL the user came back through).
    const onUrl = async ({ url }: { url: string }) => {
      const redirect = await heliumHandleURL(url);
      console.log('[Example] heliumHandleURL →', url, '→', redirect);
      if (redirect) {
        Alert.alert('Web checkout redirect', redirect);
      }
    };
    const subscription = Linking.addEventListener('url', onUrl);
    Linking.getInitialURL()
      .then((url) => {
        if (url) onUrl({ url });
      })
      .catch((e) => console.log('[Example] getInitialURL error', e));
    return () => subscription.remove();
  }, []);

  const handlePresent = (triggerName: string) => {
    presentUpsell({
      triggerName,
      dontShowIfAlreadyEntitled,
      androidDisableSystemBackNavigation: disableBackNavigation,
      eventHandlers: {
        onAnyEvent: (event) => console.log('[Example] event →', event.type),
      },
      onEntitled: () => console.log('[Example] onEntitled fired'),
      onPaywallUnavailable: () => console.log('[Example] onPaywallUnavailable fired'),
    });
  };

  const handleRefreshSdkState = async () => {
    try {
      const status = await getDownloadStatus();
      const info = await getPaywallInfo(trigger);
      setSdkState(
        `download: ${status}\n` +
          `paywall("${trigger}"): ${info ? `${info.paywallTemplateName}, shouldShow: ${info.shouldShow}` : '(none)'}`
      );
    } catch (e) {
      console.log('[Example] refresh SDK state error', e);
      setSdkState('(error — see logs)');
    }
  };

  const handleSetCustomUserId = () => {
    const uuid = Crypto.randomUUID();
    setCustomUserId(uuid);
    setCustomUserIdState(uuid);
    console.log('[Example] setCustomUserId →', uuid);
  };

  const handleClearCustomUserId = () => {
    clearCustomUserId();
    setCustomUserIdState(null);
    console.log('[Example] clearCustomUserId');
  };

  const handleGetCustomUserId = async () => {
    const id = await getCustomUserId();
    setCustomUserIdState(id);
    Alert.alert('getCustomUserId', id ?? '(null)');
  };

  const handleShowEntitlements = async () => {
    try {
      const [anyActiveSub, anyEntitlement, paywallEntitlement] = await Promise.all([
        hasAnyActiveSubscription(),
        hasAnyEntitlement(),
        hasEntitlementForPaywall(trigger),
      ]);
      let message =
        `hasAnyActiveSubscription: ${anyActiveSub}\n` +
        `hasAnyEntitlement: ${anyEntitlement}\n` +
        `hasEntitlementForPaywall("${trigger}"): ${paywallEntitlement}`;
      if (isIOS) {
        const [stripe, paddle] = await Promise.all([
          hasActiveStripeEntitlement(),
          hasActivePaddleEntitlement(),
        ]);
        message += `\nhasActiveStripeEntitlement: ${stripe}\nhasActivePaddleEntitlement: ${paddle}`;
      }
      console.log('[Example] entitlements →\n' + message);
      Alert.alert('Entitlements', message);
    } catch (e) {
      console.log('[Example] entitlements error', e);
      Alert.alert('Entitlements', 'Failed to read entitlements — see logs');
    }
  };

  const handleStubPurchase = (result: 'purchased' | 'failed' | null) => {
    if (result === null) {
      heliumTesting.reset();
      setPurchaseStub(null);
    } else {
      heliumTesting.setPurchaseResult(result);
      heliumTesting.setRestoreResult(result === 'purchased');
      setPurchaseStub(result);
    }
  };

  const handleStripePortal = async () => {
    const url = await createStripePortalSession(RETURN_URL);
    if (url) {
      Linking.openURL(url);
    } else {
      Alert.alert('Stripe portal', 'Could not create portal session');
    }
  };

  const handlePaddlePortal = async () => {
    const customerId = await getPaddleCustomerId();
    console.log('[Example] getPaddleCustomerId →', customerId);
    const url = await createPaddlePortalSession();
    if (url) {
      Linking.openURL(url);
    } else {
      Alert.alert(
        'Paddle portal',
        `Could not create portal session (customerId: ${customerId ?? 'none'})`
      );
    }
  };

  const handleReset = async () => {
    await resetHelium();
    heliumTesting.reset();
    setCustomUserIdState(null);
    setPurchaseStub(null);
    eventLog.current = [];
    setEvents([]);
    // initHelium re-enables web checkout with defaults; sync the switches.
    setWebCheckoutEnabled(true);
    setAllowCheckoutWithoutUserId(false);
    console.log('[Example] resetHelium complete — re-initializing');
    initHelium((event) => {
      eventLog.current = [event.type, ...eventLog.current].slice(0, 8);
      setEvents(eventLog.current);
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Helium Paywall SDK</Text>
        <Text style={styles.subtitle}>
          Platform: {Platform.OS} · API key: {HELIUM_API_KEY === 'REPLACE_ME' ? '(not set)' : 'set'}
          {'\n'}
          Custom user ID: {customUserId ?? '(none)'}
          {purchaseStub ? `\nPurchase stub active: ${purchaseStub}` : ''}
        </Text>

        <Text style={styles.section}>Configuration</Text>
        <TextInput
          style={styles.input}
          value={trigger}
          onChangeText={setTrigger}
          placeholder="Trigger name"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.row}>
          <Text>dontShowIfAlreadyEntitled</Text>
          <Switch value={dontShowIfAlreadyEntitled} onValueChange={setDontShowIfAlreadyEntitled} />
        </View>
        {!isIOS && (
          <View style={styles.row}>
            <Text>disableSystemBackNavigation</Text>
            <Switch value={disableBackNavigation} onValueChange={setDisableBackNavigation} />
          </View>
        )}

        <Text style={styles.section}>Present Paywall</Text>
        <View style={styles.buttons}>
          <Button title="Present paywall" onPress={() => handlePresent(trigger)} />
          <Button
            title="Present invalid trigger (fallback test)"
            onPress={() => handlePresent('nonexistent_trigger_that_does_not_exist')}
          />
        </View>

        <Text style={styles.section}>SDK State</Text>
        <Text style={styles.mono}>{sdkState}</Text>
        <View style={styles.buttons}>
          <Button title="Refresh SDK state" onPress={handleRefreshSdkState} />
        </View>

        <Text style={styles.section}>User & Entitlements</Text>
        <View style={styles.buttons}>
          <Button title="Set custom user ID (random UUID)" onPress={handleSetCustomUserId} />
          <Button title="Get custom user ID" onPress={handleGetCustomUserId} />
          <Button title="Clear custom user ID" onPress={handleClearCustomUserId} />
          <Button title="Show entitlements" onPress={handleShowEntitlements} />
        </View>

        <Text style={styles.section}>Purchase Stubs (heliumTesting)</Text>
        <View style={styles.buttons}>
          <Button title="Stub purchases: succeed" onPress={() => handleStubPurchase('purchased')} />
          <Button title="Stub purchases: fail" onPress={() => handleStubPurchase('failed')} />
          <Button title="Clear stubs (real billing)" onPress={() => handleStubPurchase(null)} />
        </View>

        {isIOS && (
          <>
            <Text style={styles.section}>Web Checkout</Text>
            <View style={styles.row}>
              <Text>externalWebCheckoutEnabled</Text>
              <Switch
                value={webCheckoutEnabled}
                onValueChange={(enabled) => {
                  if (enabled) {
                    enableExternalWebCheckout({
                      successURL: RETURN_URL,
                      cancelURL: RETURN_URL,
                    });
                  } else {
                    disableExternalWebCheckout();
                  }
                  setWebCheckoutEnabled(enabled);
                }}
              />
            </View>
            <View style={styles.row}>
              <Text>allowWebCheckoutWithoutUserId</Text>
              <Switch
                value={allowCheckoutWithoutUserId}
                onValueChange={(allow) => {
                  setAllowWebCheckoutWithoutUserId(allow);
                  setAllowCheckoutWithoutUserId(allow);
                }}
              />
            </View>
            <View style={styles.buttons}>
              <Button title="Open Stripe portal" onPress={handleStripePortal} />
              <Button title="Open Paddle portal" onPress={handlePaddlePortal} />
              <Button title="Reset Stripe entitlements" onPress={() => resetStripeEntitlements()} />
              <Button title="Reset Paddle entitlements" onPress={() => resetPaddleEntitlements()} />
            </View>
          </>
        )}

        <Text style={styles.section}>Recent Events</Text>
        <Text style={styles.mono}>{events.length > 0 ? events.join('\n') : '(none yet)'}</Text>

        <Text style={styles.section}>Danger Zone</Text>
        <View style={styles.buttons}>
          <Button title="Reset Helium" onPress={handleReset} color="#c0392b" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    // SafeAreaView is iOS-only; Android draws behind the translucent status bar.
    paddingTop: Platform.OS === 'android' ? (NativeStatusBar.currentHeight ?? 0) : 0,
  },
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 20,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
  },
  section: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 12,
    color: '#333',
  },
  buttons: {
    gap: 12,
  },
});
