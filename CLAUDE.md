# CLAUDE.md

## Project overview

React Native SDK for Helium paywalls. Supports bare React Native and Expo 49–51 (Expo 52+ is handled by the separate Expo-modules SDK). Bridges native iOS (Swift, via ObjC `RCT_EXTERN_METHOD` shim) and Android (Kotlin, via `@ReactMethod`) to TypeScript.

## Key principles

- **Never crash the host app.** This SDK is distributed to apps with millions of users. Wrap bridge boundaries and event handlers in try/catch to prevent SDK errors from propagating. For critical flows consider logging and/or surfacing failures to callers rather than silently swallowing them.
- **Avoid using "fallback" in code and comments** unless referring to the Helium fallback paywall flow. This term has a specific meaning in this SDK.

## Key architecture rule

**When modifying the native bridge interface, both iOS and Android native modules MUST be updated** so their signatures stay in sync with the JS call site.

Relevant files for bridge changes:
- `src/index.ts` — public API re-exports
- `src/native-interface.tsx` — JS bridge calls (`NativeModules.HeliumBridge`, `NativeEventEmitter`, `requireNativeComponent('HeliumUpsellView')`)
- `src/types.ts`, `src/HeliumExperimentInfo.types.ts` — TypeScript types
- `ios/RCTHeliumBridge.m` — ObjC `RCT_EXTERN_METHOD` declarations (source of truth for iOS arg order)
- `ios/HeliumSwiftInterface.swift` — iOS Swift implementation
- `android/src/main/java/com/paywallsdkreactnative/HeliumBridge.kt` — Android Kotlin module (`@ReactMethod`)
- `android/src/main/java/com/paywallsdkreactnative/PaywallSdkReactNativePackage.kt` — Android package registration

## Integrations

- RevenueCat — `src/handlers/revenuecat.ts`, `src/revenuecat.ts` (optional peer dependency `react-native-purchases`)

## Commands

See `scripts` in `package.json`. Common ones: `yarn typecheck`, `yarn lint`, `yarn test`, `yarn prepare` (builds via `react-native-builder-bob`), `yarn example` (runs the example workspace).
