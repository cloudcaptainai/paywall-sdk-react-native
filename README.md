## **Background**

Get set up with the Helium SDK for iOS in 5 minutes. Reach out over your Helium slack channel, or email [founders@tryhelium.com](mailto:founders@tryhelium.com) for any questions.

## **Installation**

We use semantic versioning and recommend version 0.2.0\+

Install **@tryheliumai/paywall-sdk-react-native** using your preferred package manager (if using Expo skip to next section):

```bash
npm install @tryheliumai/paywall-sdk-react-native
# or
yarn add @tryheliumai/paywall-sdk-react-native
```

and then run the following to install the native dependencies:

```bash
npx react-native link @tryheliumai/paywall-sdk-react-native
```

### Expo installation

If you're using Expo's managed workflow, you can install the package by adding it to your project:

```bash
npx expo install @tryheliumai/paywall-sdk-react-native
```

We recommend using Helium with Expo 49 and up. If you're an on older version and having trouble migrating, ping us - we've got experience\
with all kinds of versioning, upgrade, and custom build plugin work.

## **Configuration**

### Wrap things in a `HeliumProvider`

Wrap a suitably root-y component with `HeliumProvider`. We recommend wrapping your navigation provider, but placing HeliumProvider UNDER your sentry error boundary, to make sure
errors get logged.

```tsx
import { HeliumProvider } from '@tryheliumai/paywall-sdk-react-native';

function App() {
  return (
    <HeliumProvider>
      <YourAppComponent />
    </HeliumProvider>
  );
}
```

### Initialization

Initialize Helium by calling `initialize()` early in your app's lifecycle, typically in your root component.
`initialize` takes in a configuration object that includes your purchase config, event handlers, and other settings.

```tsx
import { initialize, createRevenueCatPurchaseConfig, createCustomPurchaseConfig } from '@tryheliumai/paywall-sdk-react-native';

function App() {
  useEffect(() => {
    initialize({
      // Helium provided api key
      apiKey: '<your-helium-api-key>',

      // Custom user id - e.g. your amplitude analytics user id.
      customUserId: '<your-custom-user-id>',

      // Purchase configuration (see next section if using RevenueCat)
      purchaseConfig: createCustomPurchaseConfig({
        makePurchase: async (productId) => {
          // Your purchase logic here
          return { status: 'purchased' };
        },
        restorePurchases: async () => {
          // Your restore logic here
          return true;
        }
      }),

      // Event handler for paywall events
      onHeliumPaywallEvent: (event) => {
        switch (event.type) {
          case 'paywallOpen':
            break;
          case 'ctaPressed':
            if (event.ctaName === HELIUM_CTA_NAMES.SCHEDULE_CALL) {
              // Handle schedule call
            }
            break;
          case 'subscriptionSucceeded':
            // Handle successful subscription
            break;
        }
      },

      // Custom user traits
      customUserTraits: {
        "example_trait": "example_value",
      },

    });
  }, []);
}
```

#### Use RevenueCat with Helium

**Important** Make sure that you've already:

- installed and configured RevenueCat's `Purchases` client - if not, follow [`https://www.revenuecat.com/docs/getting-started/configuring-sdk`](https://www.revenuecat.com/docs/getting-started/configuring-sdk) for more details.
- have packages configured for each apple app store SKU
- assigned one of your Offerings as "default"
- initialize RevenueCat (`Purchases.configure()`) _before_ initializing Helium

```javascript
import { createRevenueCatPurchaseConfig, HELIUM_CTA_NAMES } from '@tryheliumai/paywall-sdk-react-native';

import { Linking } from 'react-native';

// Usage in your app:
await initialize({
  apiKey: '<your-helium-api-key>',
  customUserId: '<your-custom-user-id>',
  purchaseConfig: createRevenueCatPurchaseConfig(),
  onHeliumPaywallEvent: (event) => {
    switch (event.type) {
      case 'subscriptionFailed':
        // Custom logic
        break;
      case 'subscriptionSucceeded':
        // Handle a subscription success event
        // e.g. navigate to a premium page
        break;
    }
  }
});
```

## **Presenting Paywalls**

Use the `presentUpsell` method in any component under the `HeliumProvider` to present a paywall. `presentUpsell` takes in a dictionary
specifying the `triggerName` as well as an optional `onFallback` parameter defining custom fallback behavior (in case the user didn't have a network connection)

```typescript
import { presentUpsell } from '@tryheliumai/paywall-sdk-react-native';

function YourComponent() {
  const handlePremiumPress = useCallback(async () => {
    await presentUpsell({
      triggerName: 'premium_feature_press',
      onFallback: () => {
        // Logic to open a default paywall
        openFallbackPaywall();
      }
    });
  }, [presentUpsell]);

  return (
    <Button title="Try Premium" onPress={handlePremiumPress} />
  );
}
```

## Custom Navigation

Handle custom navigation or dismissal by implementing the `onPaywallEvent` method in your payment delegate:

```typescript
const paymentDelegate: HeliumPaymentDelegate = {
  // ... other methods

  onPaywallEvent(event: HeliumPaywallEvent) {
    switch (event.type) {
      case 'cta_pressed':
        const { ctaName, trigger, templateName } = event;
        if (ctaName === 'dismiss') {
          // Handle custom dismissal
        }
        break;
      // ... handle other events
    }
  }
};
```

## **Paywall Events**

Helium emits various events during the lifecycle of a paywall. You can handle these events in your payment delegate. See the iOS docs for more details.
