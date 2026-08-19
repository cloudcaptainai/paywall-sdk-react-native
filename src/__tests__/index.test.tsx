import { NativeModules } from 'react-native';
import * as Helium from '../index';

jest.mock('react-native', () => {
  const bridge = {
    addListener: jest.fn(),
    removeListeners: jest.fn(),
    initialize: jest.fn(),
    presentUpsell: jest.fn(),
    hideUpsell: jest.fn(),
    hideAllUpsells: jest.fn(),
    getDownloadStatus: jest.fn(),
    getPaywallInfo: jest.fn(),
    handleDeepLink: jest.fn(),
    handlePurchaseResult: jest.fn(),
    handleRestoreResult: jest.fn(),
    fallbackOpenOrCloseEvent: jest.fn(),
    setRevenueCatAppUserId: jest.fn(),
    setCustomUserId: jest.fn(),
    getCustomUserId: jest.fn().mockResolvedValue('user-1'),
    setThirdPartyAnalyticsAnonymousId: jest.fn(),
    hasEntitlementForPaywall: jest.fn(),
    hasAnyActiveSubscription: jest.fn(),
    hasAnyEntitlement: jest.fn(),
    getExperimentInfoForTrigger: jest.fn(),
    resetHelium: jest.fn(),
    setCustomRestoreFailedStrings: jest.fn(),
    disableRestoreFailedDialog: jest.fn(),
    setLightDarkModeOverride: jest.fn(),
    setPaywallPreviewsAutoEnabledInDevBuilds: jest.fn(),
    setTestPurchaseResult: jest.fn(),
    setTestRestoreResult: jest.fn(),
    setTestIntroOfferEligibility: jest.fn(),
    resetTesting: jest.fn(),
    heliumHandleURL: jest.fn().mockResolvedValue('success'),
    enableExternalWebCheckout: jest.fn(),
    enableExternalWebCheckoutSuccessAndCancel: jest.fn(),
    disableExternalWebCheckout: jest.fn(),
    setAllowWebCheckoutWithoutUserId: jest.fn(),
    hasActiveStripeEntitlement: jest.fn().mockResolvedValue(false),
    hasActivePaddleEntitlement: jest.fn().mockResolvedValue(false),
    createStripePortalSession: jest.fn().mockResolvedValue('https://portal'),
    resetStripeEntitlements: jest.fn(),
    createPaddlePortalSession: jest.fn().mockResolvedValue('https://portal'),
    getPaddleCustomerId: jest.fn().mockResolvedValue(null),
    resetPaddleEntitlements: jest.fn(),
  };
  return {
    NativeModules: { HeliumBridge: bridge },
    NativeEventEmitter: jest.fn().mockImplementation(() => ({
      addListener: jest.fn(() => ({ remove: jest.fn() })),
      removeAllListeners: jest.fn(),
    })),
    Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default },
  };
});

const bridge = NativeModules.HeliumBridge;

describe('public API surface', () => {
  const expectedFunctions = [
    'initialize',
    'presentUpsell',
    'hideUpsell',
    'hideAllUpsells',
    'getPaywallInfo',
    'getDownloadStatus',
    'handleDeepLink',
    'setRevenueCatAppUserId',
    'setCustomUserId',
    'clearCustomUserId',
    'getCustomUserId',
    'setThirdPartyAnalyticsAnonymousId',
    'hasEntitlementForPaywall',
    'hasAnyActiveSubscription',
    'hasAnyEntitlement',
    'getExperimentInfoForTrigger',
    'resetHelium',
    'setCustomRestoreFailedStrings',
    'disableRestoreFailedDialog',
    'setLightDarkModeOverride',
    'setPaywallPreviewsEnabledInDevBuilds',
    'createCustomPurchaseConfig',
    'heliumHandleURL',
    'enableExternalWebCheckout',
    'disableExternalWebCheckout',
    'setAllowWebCheckoutWithoutUserId',
    'hasActiveStripeEntitlement',
    'hasActivePaddleEntitlement',
    'createStripePortalSession',
    'resetStripeEntitlements',
    'createPaddlePortalSession',
    'getPaddleCustomerId',
    'resetPaddleEntitlements',
  ] as const;

  it.each(expectedFunctions)('exports %s as a function', (name) => {
    expect(typeof (Helium as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports the heliumTesting stubs', () => {
    expect(typeof Helium.heliumTesting.setPurchaseResult).toBe('function');
    expect(typeof Helium.heliumTesting.setRestoreResult).toBe('function');
    expect(typeof Helium.heliumTesting.setIntroOfferEligibility).toBe('function');
    expect(typeof Helium.heliumTesting.reset).toBe('function');
  });

  it('exports HELIUM_CTA_NAMES', () => {
    expect(Helium.HELIUM_CTA_NAMES).toBeDefined();
  });
});

describe('custom user id', () => {
  it('clearCustomUserId clears via setCustomUserId(null)', () => {
    Helium.clearCustomUserId();
    expect(bridge.setCustomUserId).toHaveBeenCalledWith(null);
  });

  it('getCustomUserId resolves the bridge value', async () => {
    await expect(Helium.getCustomUserId()).resolves.toBe('user-1');
  });
});

describe('heliumTesting', () => {
  it('passes stubbed results through to the bridge', () => {
    Helium.heliumTesting.setPurchaseResult('purchased');
    expect(bridge.setTestPurchaseResult).toHaveBeenCalledWith('purchased');

    Helium.heliumTesting.setRestoreResult(true);
    expect(bridge.setTestRestoreResult).toHaveBeenCalledWith(true);

    Helium.heliumTesting.setIntroOfferEligibility(false);
    expect(bridge.setTestIntroOfferEligibility).toHaveBeenCalledWith(false);

    Helium.heliumTesting.reset();
    expect(bridge.resetTesting).toHaveBeenCalled();
  });
});

describe('presentUpsell', () => {
  it('defaults omitted boolean args (bridge BOOLs are non-nullable)', () => {
    Helium.presentUpsell({ triggerName: 'my_trigger' });
    expect(bridge.presentUpsell).toHaveBeenCalledWith('my_trigger', undefined, false, false);
  });
});

describe('setPaywallPreviewsEnabledInDevBuilds', () => {
  it('passes through to the bridge', () => {
    Helium.setPaywallPreviewsEnabledInDevBuilds(false);
    expect(bridge.setPaywallPreviewsAutoEnabledInDevBuilds).toHaveBeenCalledWith(false);
  });
});

describe('web checkout', () => {
  it('rejects an empty paymentProcessors array without calling the bridge', () => {
    Helium.enableExternalWebCheckout({
      redirectURL: 'app://openapp',
      paymentProcessors: [],
    });
    expect(bridge.enableExternalWebCheckout).not.toHaveBeenCalled();
  });

  it('rejects an empty redirectURL without calling the bridge', () => {
    Helium.enableExternalWebCheckout({ redirectURL: '', paymentProcessors: ['stripe'] });
    expect(bridge.enableExternalWebCheckout).not.toHaveBeenCalled();
  });

  it('passes a redirect URL through to the bridge on iOS', () => {
    Helium.enableExternalWebCheckout({
      redirectURL: 'app://openapp',
      paymentProcessors: ['stripe'],
    });
    expect(bridge.enableExternalWebCheckout).toHaveBeenCalledWith('app://openapp', [
      'stripe',
    ]);
  });

  it('routes the deprecated shape to the dedicated bridge method', () => {
    jest.clearAllMocks();
    Helium.enableExternalWebCheckout({
      successURL: 'app://success',
      cancelURL: 'app://cancel',
    });
    expect(bridge.enableExternalWebCheckoutSuccessAndCancel).toHaveBeenCalledWith(
      'app://success',
      'app://cancel',
      undefined
    );
    expect(bridge.enableExternalWebCheckout).not.toHaveBeenCalled();
  });

  it('returns safe defaults without calling the bridge on non-iOS platforms', async () => {
    jest.clearAllMocks();
    const { Platform } = require('react-native');
    Platform.OS = 'android';
    try {
      await expect(Helium.hasActiveStripeEntitlement()).resolves.toBe(false);
      await expect(Helium.hasActivePaddleEntitlement()).resolves.toBe(false);
      await expect(Helium.getPaddleCustomerId()).resolves.toBeUndefined();
      await expect(Helium.createStripePortalSession('app://r')).resolves.toBeUndefined();
      await expect(Helium.heliumHandleURL('app://success')).resolves.toBeUndefined();
      Helium.enableExternalWebCheckout({
        redirectURL: 'app://openapp',
        paymentProcessors: ['stripe'],
      });
      Helium.resetPaddleEntitlements();

      expect(bridge.hasActiveStripeEntitlement).not.toHaveBeenCalled();
      expect(bridge.hasActivePaddleEntitlement).not.toHaveBeenCalled();
      expect(bridge.getPaddleCustomerId).not.toHaveBeenCalled();
      expect(bridge.createStripePortalSession).not.toHaveBeenCalled();
      expect(bridge.heliumHandleURL).not.toHaveBeenCalled();
      expect(bridge.enableExternalWebCheckout).not.toHaveBeenCalled();
      expect(bridge.resetPaddleEntitlements).not.toHaveBeenCalled();
    } finally {
      Platform.OS = 'ios';
    }
  });
});
