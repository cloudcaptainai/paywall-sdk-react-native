import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { HeliumPaywallView } from '@tryheliumai/paywall-sdk-react-native';

type Props = {
  trigger: string;
  onDone: () => void;
};

export function EmbeddedPaywallScreen({ trigger, onDone }: Props) {
  return (
    <View style={styles.screen}>
      <HeliumPaywallView
        triggerName={trigger}
        style={styles.paywall}
        eventHandlers={{
          onAnyEvent: (event) => console.log('[Example] embedded event →', event.type),
          onDismissed: onDone,
        }}
        onEntitled={onDone}
        paywallNotShownReplacement={<Text style={styles.notShown}>Paywall not shown</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#fff',
  },
  paywall: {
    flex: 1,
  },
  notShown: {
    margin: 20,
    color: '#555',
  },
});
