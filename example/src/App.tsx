import { useState, useEffect } from 'react';
import {
  initialize,
  presentUpsell,
} from '@tryheliumai/paywall-sdk-react-native';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  Button,
  Dimensions,
} from 'react-native';
import { DemoHeliumCallbacks } from './demo-handlers';
import { Colors } from 'react-native/Libraries/NewAppScreen';
import React from 'react';
import Purchases from 'react-native-purchases';
import { TestRevenueCatHeliumCallbacks } from './rc-handlers';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const handlers = new DemoHeliumCallbacks();
  const [events, setEvents] = useState<any[]>([]);
  const [showEmbeddedUpsell, setShowEmbeddedUpsell] = useState(false);

  // Update events every second
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setEvents(handlers.getEventHistory());
  //   }, 1000);
  //   return () => clearInterval(interval);
  // }, []);

  useEffect(() => {
    initialize(handlers, {});
    Purchases.configure({
      apiKey: 'rc_id',
    });
  }, []);

  const backgroundStyle = {
    backgroundColor: isDarkMode ? Colors.darker : Colors.lighter,
  };

  return (
    <SafeAreaView style={[backgroundStyle, styles.container]}>
      <View style={styles.buttonContainer}>
        <Button
          title="Get Balance"
          onPress={() =>
            initialize(new TestRevenueCatHeliumCallbacks(), {
              apiKey: 'api-key',
              customUserTraits: {
                exampleUserTrait: 'test_value',
              },
            })
          }
        />

        <Button
          title="Onboarding"
          onPress={() => presentUpsell({ triggerName: 'onboarding' })}
        />
        <Button
          title="Ad opt out"
          onPress={() => presentUpsell({ triggerName: 'ad-opt-out' })}
        />
        <Button
          title="Fallback"
          onPress={() => presentUpsell({ triggerName: 'fallback' })}
        />
        <Button
          title="Scenario analysis"
          onPress={() => presentUpsell({ triggerName: 'scenario-analysis' })}
        />
        <Button
          title="Closing line value"
          onPress={() => presentUpsell({ triggerName: 'closing-line-value' })}
        />
        <Button
          title={
            showEmbeddedUpsell ? 'Hide Embedded Upsell' : 'Show Embedded Upsell'
          }
          onPress={() => setShowEmbeddedUpsell(!showEmbeddedUpsell)}
        />
      </View>

      {/*{showEmbeddedUpsell && (*/}
      {/*  <View style={styles.embeddedUpsell}>*/}
      {/*    <UpsellView*/}
      {/*      trigger="after_moment_send"*/}
      {/*      style={{ width: '100%', height: '100%' }}*/}
      {/*    />*/}
      {/*  </View>*/}
      {/*)}*/}

      <View style={styles.eventContainer}>
        <Text style={styles.eventTitle}>Event History:</Text>
        <ScrollView style={styles.eventList}>
          {events.map((event, index) => (
            <View key={index} style={styles.eventItem}>
              <Text style={styles.timestamp}>
                {event.timestamp.toLocaleTimeString()}
              </Text>
              <Text style={styles.eventText}>
                {JSON.stringify(event.event, null, 2)}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  buttonContainer: {
    padding: 20,
    gap: 10,
  },
  eventContainer: {
    flex: 1,
    padding: 20,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  eventList: {
    flex: 1,
  },
  eventItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  timestamp: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  eventText: {
    fontSize: 14,
  },
  embeddedUpsell: {
    height: Dimensions.get('window').height * 0.6,
    width: '100%',
  },
});

export default App;
