import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import {
  initialize,
  presentUpsell,
  setCustomUserId,
  clearCustomUserId,
  getCustomUserId,
  hasAnyActiveSubscription,
  hasAnyEntitlement,
  hasEntitlementForPaywall,
  hasActiveStripeEntitlement,
  hasActivePaddleEntitlement,
  enableExternalWebCheckout,
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

function initHelium() {
  // Must be called before initialize(). Omitting paymentProcessors enables all
  // (Paddle + Stripe), so any web-checkout paywall in the org can show.
  enableExternalWebCheckout({ successURL: RETURN_URL, cancelURL: RETURN_URL });
  initialize({ apiKey: HELIUM_API_KEY });
}

export default function App() {
  const [trigger, setTrigger] = useState(TRIGGER_NAME);
  const [dontShowIfAlreadyEntitled, setDontShowIfAlreadyEntitled] = useState(false);
  const [customUserId, setCustomUserIdState] = useState<string | null>(null);

  useEffect(() => {
    initHelium();

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
    Linking.getInitialURL().then((url) => {
      if (url) onUrl({ url });
    });
    return () => subscription.remove();
  }, []);

  const handlePresent = (triggerName: string) => {
    presentUpsell({
      triggerName,
      dontShowIfAlreadyEntitled,
      eventHandlers: {
        onAnyEvent: (event) => console.log('[Example] event →', event.type),
      },
      onEntitled: () => console.log('[Example] onEntitled fired'),
      onPaywallUnavailable: () => console.log('[Example] onPaywallUnavailable fired'),
    });
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
    const [anyActiveSub, anyEntitlement, paywallEntitlement, stripe, paddle] = await Promise.all([
      hasAnyActiveSubscription(),
      hasAnyEntitlement(),
      hasEntitlementForPaywall(trigger),
      hasActiveStripeEntitlement(),
      hasActivePaddleEntitlement(),
    ]);
    const message =
      `hasAnyActiveSubscription: ${anyActiveSub}\n` +
      `hasAnyEntitlement: ${anyEntitlement}\n` +
      `hasEntitlementForPaywall("${trigger}"): ${paywallEntitlement}\n` +
      `hasActiveStripeEntitlement: ${stripe}\n` +
      `hasActivePaddleEntitlement: ${paddle}`;
    console.log('[Example] entitlements →\n' + message);
    Alert.alert('Entitlements', message);
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
    setCustomUserIdState(null);
    console.log('[Example] resetHelium complete — re-initializing');
    initHelium();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Helium Paywall SDK</Text>
        <Text style={styles.subtitle}>
          API key: {HELIUM_API_KEY === 'REPLACE_ME' ? '(not set)' : 'set'}
          {'\n'}
          Custom user ID: {customUserId ?? '(none)'}
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

        <Text style={styles.section}>Present Paywall</Text>
        <View style={styles.buttons}>
          <Button title="Present paywall" onPress={() => handlePresent(trigger)} />
          <Button
            title="Present invalid trigger (fallback test)"
            onPress={() => handlePresent('nonexistent_trigger_that_does_not_exist')}
          />
        </View>

        <Text style={styles.section}>User & Entitlements</Text>
        <View style={styles.buttons}>
          <Button title="Set custom user ID (random UUID)" onPress={handleSetCustomUserId} />
          <Button title="Get custom user ID" onPress={handleGetCustomUserId} />
          <Button title="Clear custom user ID" onPress={handleClearCustomUserId} />
          <Button title="Show entitlements" onPress={handleShowEntitlements} />
        </View>

        <Text style={styles.section}>Web Checkout (iOS)</Text>
        <View style={styles.buttons}>
          <Button title="Open Stripe portal" onPress={handleStripePortal} />
          <Button title="Open Paddle portal" onPress={handlePaddlePortal} />
        </View>

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
  buttons: {
    gap: 12,
  },
});
