# Helium bare React Native example

A bare React Native 0.74 app (no Expo) consuming `@tryheliumai/paywall-sdk-react-native` from the repo root via `file:../..` and RN CLI autolinking. Same platform-aware feature set as the Expo example (`../expo-51`).

## Setup

```bash
npm install
```

Fill in your Helium credentials: either edit `helium.config.ts`, or (preferred) create
`helium.config.local.ts` with the same shape — it is gitignored and takes precedence.

## iOS

```bash
cd ios && LANG=en_US.UTF-8 pod install && cd ..
npx react-native run-ios                     # simulator
npx react-native run-ios --list-devices     # pick a physical device
```

Device builds need a signing team: open `ios/HeliumBareExample.xcworkspace` in Xcode and
set one under Signing & Capabilities, or pass `DEVELOPMENT_TEAM` to xcodebuild.

## Android

```bash
npx react-native run-android
```

Uses whatever device/emulator `adb devices` shows. Metro starts automatically with both
commands; if you need it standalone: `npx react-native start`.

## Notes

- `metro.config.js` watches the repo root so SDK source edits hot-reload, and sets
  `transformer.allowOptionalDependencies` so the SDK's optional `expo-file-system`
  require doesn't break bundling in this Expo-less app.
- The `heliumbareexample://` URL scheme is registered on both platforms for web
  checkout return deep links.
