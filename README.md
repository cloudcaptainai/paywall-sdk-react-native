# @tryheliumai/paywall-sdk-react-native

[Helium](https://tryhelium.com) lets you build, test, and optimize paywalls remotely — no app releases required. This package is the Helium SDK for **bare React Native** apps and **Expo 49–51** projects, supporting **iOS and Android**.

> **On Expo 52 or later?** Use [`expo-helium`](https://github.com/cloudcaptainai/helium-expo-sdk) instead — it's built on Expo Modules and tracks newer Expo releases. This package intentionally stays compatible with older React Native tooling.

| | |
|---|---|
| React Native | >= 0.71.7 |
| iOS | 15.0+ (helium-swift 4.5.5) |
| Android | minSdk 24 (helium-android 4.4.7) |
| `react-native-purchases` | >= 8.0.0 — optional, only for the RevenueCat handler |
| `expo-file-system` | optional, Expo projects only (fallback-bundle file handling); bare RN works without it |

## Installation

```bash
npm install @tryheliumai/paywall-sdk-react-native
# or
yarn add @tryheliumai/paywall-sdk-react-native
```

**Bare React Native** — the native module autolinks; install pods and you're done:

```bash
cd ios && pod install
```

**Expo 49–51** — regenerate the native projects so the module links:

```bash
npx expo prebuild
```

## Quick start

Initialize once at app startup, then present paywalls from anywhere:

```tsx
import { useEffect } from 'react';
import { Button } from 'react-native';
import { initialize, presentUpsell } from '@tryheliumai/paywall-sdk-react-native';

function App() {
  useEffect(() => {
    initialize({
      apiKey: '<your-helium-api-key>',
      customUserId: 'your-user-id',            // optional but recommended
      customUserTraits: { plan: 'free' },      // optional targeting attributes
    });
  }, []);
  // ...
}

function PremiumButton() {
  return (
    <Button
      title="Try Premium"
      onPress={() =>
        presentUpsell({
          triggerName: 'premium_feature_press',
          eventHandlers: {
            onPurchaseSucceeded: (event) => console.log('purchased', event.productId),
            onDismissed: () => console.log('dismissed'),
          },
          onEntitled: () => {
            // Purchase or restore succeeded (also fires when the paywall is
            // skipped for an already-entitled user with dontShowIfAlreadyEntitled).
          },
          onPaywallUnavailable: () => {
            // Rare: neither the paywall nor its second-try paywall could show.
          },
        })
      }
    />
  );
}
```

Triggers are configured in [your Helium dashboard](https://app.tryhelium.com/workflows). `hideUpsell()` / `hideAllUpsells()` dismiss programmatically.

Useful presentation options:

```tsx
presentUpsell({
  triggerName: 'my_trigger',
  dontShowIfAlreadyEntitled: true,          // skip users who already own a product on the paywall
  androidDisableSystemBackNavigation: true, // Android: block the back gesture while showing
  customPaywallTraits: { source: 'onboarding' },
});
```

## Purchases

**Default (no config):** Helium handles purchases natively — StoreKit 2 on iOS, Play Billing on Android. Nothing to wire up.

**RevenueCat:**

```tsx
import Purchases from 'react-native-purchases';
import { createRevenueCatPurchaseConfig } from '@tryheliumai/paywall-sdk-react-native/src/revenuecat';

await initialize({
  apiKey: '<your-helium-api-key>',
  purchaseConfig: createRevenueCatPurchaseConfig({
    apiKeyIOS: '<rc-ios-key>',       // omit the keys entirely if your app
    apiKeyAndroid: '<rc-android-key>', // already configures RevenueCat itself
  }),
  revenueCatAppUserId: await Purchases.getAppUserID(),
});
```

Requires `react-native-purchases` >= 8.0.0. Keep the Helium user in sync with `setRevenueCatAppUserId()` whenever the RC app user changes. The handler retries transient store errors and, after Stripe/Paddle web purchases, polls RevenueCat so entitlements don't stay stale waiting on the webhook (`disableStripePurchaseSync` / `disablePaddlePurchaseSync` opt out).

**Custom:** bring your own purchase logic:

```tsx
import { createCustomPurchaseConfig } from '@tryheliumai/paywall-sdk-react-native';

purchaseConfig: createCustomPurchaseConfig({
  makePurchaseIOS: async (productId) => ({ status: 'purchased' }),
  makePurchaseAndroid: async (productId, basePlanId, offerId) => ({ status: 'purchased' }),
  restorePurchases: async () => true,
});
```

Handlers return `'purchased' | 'failed' | 'cancelled' | 'pending' | 'restored'`.

## Events

Listen globally or per presentation:

```tsx
initialize({
  apiKey: '...',
  onHeliumPaywallEvent: (event) => analytics.track(event.type, event),
});

presentUpsell({
  triggerName: 'my_trigger',
  eventHandlers: {
    onOpen: (e) => {},
    onClose: (e) => {},
    onDismissed: (e) => {},
    onPurchaseSucceeded: (e) => {},   // includes e.paymentProcessor
    onOpenFailed: (e) => {},
    onCustomPaywallAction: (e) => {}, // e.actionName + e.params from the paywall
    onAnyEvent: (e) => {},
  },
});
```

See the [event reference](https://docs.tryhelium.com/guides/helium-events) for every event type and payload field.

## Fallback bundle

Ship a local copy of your paywalls so one can always render — offline, or before the first config download finishes:

```tsx
initialize({
  apiKey: '...',
  fallbackBundle: require('./helium-fallbacks.json'),
});
```

Download the bundle from [app.tryhelium.com](https://app.tryhelium.com) → Workflows. Expo projects write it via `expo-file-system`; bare RN apps pass it directly — no extra dependency. Guide: [fallback paywalls](https://docs.tryhelium.com/guides/fallback-bundle).

## Users & entitlements

```tsx
setCustomUserId('user-123');
const id = await getCustomUserId();
clearCustomUserId();
setThirdPartyAnalyticsAnonymousId('amplitude-device-id'); // correlate with your analytics

await hasEntitlementForPaywall('my_trigger'); // true / false / undefined (not downloaded yet)
await hasAnyActiveSubscription();
await hasAnyEntitlement();
await getExperimentInfoForTrigger('my_trigger'); // experiment allocation details
```

## Web checkout — Stripe & Paddle (iOS)

Sell web-based subscriptions from your paywalls. Enable **before** `initialize()`, and register the redirect scheme as a deep link in your app:

```tsx
import { Linking } from 'react-native';
import {
  enableExternalWebCheckout,
  heliumHandleURL,
} from '@tryheliumai/paywall-sdk-react-native';

// before initialize()
enableExternalWebCheckout({
  successURL: 'yourapp://openapp',
  cancelURL: 'yourapp://openapp',
  paymentProcessors: ['paddle'], // omit to enable both paddle and stripe
});

// forward returning deep links so the SDK reacts to checkout redirects
useEffect(() => {
  const sub = Linking.addEventListener('url', ({ url }) => heliumHandleURL(url));
  Linking.getInitialURL()
    .then((url) => url && heliumHandleURL(url))
    .catch(() => {});
  return () => sub.remove();
}, []);
```

Set a custom user id before showing web-checkout paywalls (or opt into `setAllowWebCheckoutWithoutUserId(true)` — read its warning first). Then:

```tsx
await hasActiveStripeEntitlement();
await hasActivePaddleEntitlement();

// "Manage subscription" button:
const url = await createStripePortalSession('yourapp://openapp');
if (url) Linking.openURL(url);
// Paddle: getPaddleCustomerId() → generate the portal session on your server

resetStripeEntitlements(); // "log out" a web-checkout user
resetPaddleEntitlements();
```

Dashboard-side setup (products, webhook, the linked hosted web paywall) is covered by the [Paddle onboarding guide](https://docs.tryhelium.com/guides/paddle-onboarding-guide). On Android these APIs are safe no-ops — paywalls requiring web checkout won't show there until the native Android SDK supports it.

## Customization

```tsx
setLightDarkModeOverride('dark');                // 'light' | 'dark' | 'system'
setCustomRestoreFailedStrings('Oops', 'No purchases found', 'OK');
disableRestoreFailedDialog();
setPaywallPreviewsEnabledInDevBuilds(false);     // triple-tap previews in dev builds
```

## Automated testing

Stub purchase flows for UI tests and CI, where StoreKit / Play Billing aren't available. Debug builds only — gate the calls so they never run in production:

```tsx
import { heliumTesting } from '@tryheliumai/paywall-sdk-react-native';

heliumTesting.setPurchaseResult('purchased');
heliumTesting.setRestoreResult(true);
heliumTesting.setIntroOfferEligibility(true); // call before initialize()
heliumTesting.reset();                        // back to real billing
```

## Debugging

```tsx
await getDownloadStatus();       // 'downloadSuccess' | 'downloadFailure' | 'inProgress' | 'notDownloadedYet'
await getPaywallInfo('trigger'); // { paywallTemplateName, shouldShow }
```

Native SDK logs are routed to the JS console (`[Helium] ...`) with matching levels, so config problems surface in Metro during development.

## Example apps

Both live under [`examples/`](examples) and exercise the full SDK surface with a shared, platform-aware UI:

- [`examples/expo-51`](examples/expo-51) — Expo 51. Copy `.env.example` → `.env`, then `npx expo prebuild && npx expo run:ios` / `run:android`.
- [`examples/bare-rn`](examples/bare-rn) — bare React Native 0.74, no Expo. See [its README](examples/bare-rn/README.md) for setup and run commands.

## Contributing

```bash
yarn install
yarn test        # jest
yarn typecheck   # tsc
yarn lint        # eslint
yarn prepare     # build with react-native-builder-bob
```

When changing the native bridge, keep all three layers in sync: the JS calls in `src/native-interface.tsx`, the iOS declarations/implementation in `ios/RCTHeliumBridge.m` + `ios/HeliumSwiftInterface.swift`, and the Android module in `android/src/main/java/com/paywallsdkreactnative/HeliumBridge.kt`.

## Docs & support

Full guides live at [docs.tryhelium.com](https://docs.tryhelium.com/sdk/quickstart-react-native), or reach us at [founders@tryhelium.com](mailto:founders@tryhelium.com).
