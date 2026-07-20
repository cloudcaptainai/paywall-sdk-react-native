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
