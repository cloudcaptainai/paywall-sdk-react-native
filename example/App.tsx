import { useEffect, useState } from 'react';
import { Alert, Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Crypto from 'expo-crypto';
import {
  initialize,
  presentUpsell,
  setCustomUserId,
  hasAnyActiveSubscription,
  hasAnyEntitlement,
  hasEntitlementForPaywall,
  resetHelium,
} from '@tryheliumai/paywall-sdk-react-native';

// Values come from .env (see .env.example). Placeholders only apply if the
// env var is missing — fine for building the app but all Helium calls will
// fail until you fill them in.
const HELIUM_API_KEY = process.env.EXPO_PUBLIC_HELIUM_API_KEY ?? 'REPLACE_ME';
const TRIGGER_NAME = process.env.EXPO_PUBLIC_HELIUM_TRIGGER ?? 'REPLACE_ME';

export default function App() {
  const [customUserId, setCustomUserIdState] = useState<string | null>(null);

  useEffect(() => {
    initialize({ apiKey: HELIUM_API_KEY });
  }, []);

  const handleSetCustomUserId = () => {
    const uuid = Crypto.randomUUID();
    setCustomUserId(uuid);
    setCustomUserIdState(uuid);
    console.log('[Example] setCustomUserId →', uuid);
  };

  const handleShowEntitlements = async () => {
    const [anyActiveSub, anyEntitlement, paywallEntitlement] = await Promise.all([
      hasAnyActiveSubscription(),
      hasAnyEntitlement(),
      hasEntitlementForPaywall(TRIGGER_NAME),
    ]);
    const message =
      `hasAnyActiveSubscription: ${anyActiveSub}\n` +
      `hasAnyEntitlement: ${anyEntitlement}\n` +
      `hasEntitlementForPaywall("${TRIGGER_NAME}"): ${paywallEntitlement}`;
    console.log('[Example] entitlements →\n' + message);
    Alert.alert('Entitlements', message);
  };

  const handleReset = async () => {
    await resetHelium();
    setCustomUserIdState(null);
    console.log('[Example] resetHelium complete — re-initializing');
    initialize({ apiKey: HELIUM_API_KEY });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Helium Paywall SDK</Text>
      <Text style={styles.subtitle}>
        API key: {HELIUM_API_KEY === 'REPLACE_ME' ? '(not set)' : 'set'}
        {'\n'}
        Trigger: {TRIGGER_NAME}
        {'\n'}
        Custom user ID: {customUserId ?? '(none)'}
      </Text>

      <View style={styles.buttons}>
        <Button
          title="Present paywall"
          onPress={() => presentUpsell({ triggerName: TRIGGER_NAME })}
        />
        <Button title="Set custom user ID (random UUID)" onPress={handleSetCustomUserId} />
        <Button title="Show entitlements" onPress={handleShowEntitlements} />
        <Button title="Reset Helium" onPress={handleReset} color="#c0392b" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    marginTop: 40,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
    marginBottom: 24,
  },
  buttons: {
    gap: 12,
  },
});
