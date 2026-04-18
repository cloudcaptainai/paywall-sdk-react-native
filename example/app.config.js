module.exports = () => ({
  expo: {
    name: 'Helium Paywall SDK Example',
    slug: 'paywall-sdk-react-native-example',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.helium.example.ios',
      appleTeamId: process.env.APPLE_TEAM_ID,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      package: 'com.tryhelium.android',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      [
        'expo-build-properties',
        {
          ios: { deploymentTarget: '15.0' },
          android: { minSdkVersion: 24 },
        },
      ],
    ],
  },
});
