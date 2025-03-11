---
title: 'SDK Quickstart (React Native)'
description: 'Integrate Helium into your React Native App'
icon: 'code'
---

## **Background**

Get set up with the Helium SDK for iOS in 5 minutes. Reach out over your Helium slack channel, or email founders@tryhelium.com for any questions.
## **Installation**

Install **@tryheliumai/paywall-sdk-react-native** using your preferred package manager:

```bash
npm install @tryheliumai/paywall-sdk-react-native
# or
yarn add @tryheliumai/paywall-sdk-react-native
```

The package should be autolinked. If not, you can manually link it by running:

```bash
cd ios
npx pod-install
cd ..
npx react-native link @tryheliumai/paywall-sdk-react-native
```

### TypeScript Configuration

If you encounter TypeScript errors related to module resolution, you may need to update your `tsconfig.json` file. The SDK uses modern module resolution, so you'll need to set the `moduleResolution` option to one of the following:

```json
{
  "compilerOptions": {
    "moduleResolution": "node16" // or "nodenext" or "bundler"
  }
}
```

Alternatively, you can add a `paths` entry to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@tryheliumai/paywall-sdk-react-native": ["./node_modules/@tryheliumai/paywall-sdk-react-native/lib/typescript/module/src/index.d.ts"]
    }
  }
}
```

## **Configuration**

### Provider Setup

Wrap your app's root component with `HeliumProvider`. This provider makes Helium's functionality available throughout your app:

```tsx
import { HeliumProvider } from '@tryheliumai/paywall-sdk-react-native';

function App() {
  return (
    <HeliumProvider
      apiKey="<your-helium-api-key>"
      fallbackComponent={YourFallbackComponent}
    >
      <YourAppComponent />
    </HeliumProvider>
  );
}
```

### Initialization

Initialize Helium by calling `Helium.initialize()` early in your app's lifecycle, typically in your root component:

```tsx
import { initializeHelium } from '@tryheliumai/paywall-sdk-react-native';

function App() {
  useEffect(() => {
    initializeHelium({
      // Helium provided api key
      apiKey: '<your-helium-api-key>',

      // Purchase handlers: described in next section
      delegate: yourDelegate

      // Custom user id - e.g. your amplitude analytics user id.
      customUserId: '<your-custom-user-id>',

      // Helium provided custom API endpoint
      customApiEndpoint: '<your-custom-api-endpoint>',

      // Custom user traits
      customUserTraits: {
        "example_trait": "example_value",
      },
    });
  }, []);
}
```

### Payment Delegate Implementation

Create a payment delegate object that implements the `HeliumPaymentDelegate` interface. This delegate handles purchase logic for your paywalls:

```typescript
export type HeliumTransactionStatus =
  | { type: 'purchased' }
  | { type: 'cancelled' }
  | { type: 'abandoned' }
  | { type: 'failed', error: Error }
  | { type: 'restored' }
  | { type: 'pending' };

export interface HeliumPaymentDelegate {
  // [REQUIRED] Trigger the purchase of a product
  makePurchase: (productId: string) => Promise<HeliumTransactionStatus>;

  // [OPTIONAL] Restore existing subscriptions
  restorePurchases?: () => Promise<boolean>;

  // [OPTIONAL] Handle Helium paywall events
  onPaywallEvent?: (event: HeliumPaywallEvent) => void;

  // [OPTIONAL] Provides custom variables for dynamic paywall content
  getCustomVariables?: () => Record<string, any>;
}
```

### Example Delegate

Here's an example delegate using React Native's in-app purchases:

```typescript
import * as RNIap from 'react-native-iap';

const paymentDelegate: HeliumPaymentDelegate = {
  async makePurchase(productId: string): Promise<HeliumTransactionStatus> {
    try {
      const products = await RNIap.getProducts([productId]);
      const purchase = await RNIap.requestPurchase(productId);
      
      if (purchase) {
        return { type: 'purchased' };
      }
      return { type: 'cancelled' };
    } catch (error) {
      return { type: 'failed', error };
    }
  },

  async restorePurchases(): Promise<boolean> {
    try {
      await RNIap.initConnection();
      const restored = await RNIap.restorePurchases();
      return restored.length > 0;
    } catch (error) {
      console.error('Restore failed:', error);
      return false;
    }
  },

  getCustomVariables() {
    return {
      userSubscriptionStatus: checkUserSubscriptionStatus(),
      userIntent: checkUserIntent(),
    };
  }
};
```

### Checking Download Status

Monitor the status of paywall configuration downloads using the `useHeliumStatus` hook:

```typescript
import { useHeliumStatus } from '@tryhelium/paywall-sdk';

function YourComponent() {
  const status = useHeliumStatus();

  useEffect(() => {
    switch (status.type) {
      case 'not_downloaded':
        console.log('Download not started or in progress');
        break;
      case 'success':
        console.log('Download successful with config ID:', status.configId);
        break;
      case 'error':
        console.log('Download failed');
        break;
    }
  }, [status]);

  return <YourContent />;
}
```

## **Presenting Paywalls**

### Using the Hook

Use the `presentPaywall` method in any component under the `HeliumProvider` to present a paywall:

```typescript
import { presentPaywall } from '@tryhelium/paywall-sdk';

function YourComponent() {
  const handlePremiumPress = useCallback(async () => {
    await presentPaywall({ trigger: 'premium_feature_press' });
  }, [presentPaywall]);

  return (
    <Button title="Try Premium" onPress={handlePremiumPress} />
  );
}
```

### Custom Navigation

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

Helium emits various events during the lifecycle of a paywall. You can handle these events in your payment delegate. See the iOS docs
for more details.