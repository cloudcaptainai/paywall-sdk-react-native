import { NativeModules } from 'react-native';
import * as Helium from '../index';

jest.mock('react-native', () => {
  const listeners = new Map<string, Array<(payload?: unknown) => void>>();
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
      addListener: jest.fn((name: string, listener: (payload?: unknown) => void) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener]);
        return { remove: jest.fn() };
      }),
      removeAllListeners: jest.fn((name: string) => {
        listeners.delete(name);
      }),
    })),
    Platform: { OS: 'ios', select: (obj: any) => obj.ios ?? obj.default },
    __heliumListeners: listeners,
  };
});

const bridge = NativeModules.HeliumBridge;

const emitNativeEvent = (name: string, payload?: unknown) => {
  const { __heliumListeners } = require('react-native');
  for (const listener of __heliumListeners.get(name) ?? []) {
    listener(payload);
  }
};

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
    expect(bridge.enableExternalWebCheckout).toHaveBeenCalledWith('app://openapp', ['stripe']);
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

describe('presentUpsell skip and entitled handling', () => {
  const holdoutSkip = {
    type: 'paywallSkipped',
    triggerName: 'my_trigger',
    skipReason: 'targetingHoldout',
  };
  const entitledSkip = {
    type: 'paywallSkipped',
    triggerName: 'my_trigger',
    skipReason: 'alreadyEntitled',
  };
  let consoleError: jest.SpyInstance;

  beforeAll(async () => {
    await Helium.initialize({ apiKey: 'test-key' });
  });

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('calls onPaywallSkip once for a targeting holdout skip event', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).toHaveBeenCalledWith(holdoutSkip);
  });

  it('keeps a handler registered by a re-entrant presentUpsell inside onPaywallSkip', () => {
    const second = jest.fn();
    const first = jest.fn(() => {
      Helium.presentUpsell({ triggerName: 'second_trigger', onPaywallSkip: second });
    });
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip: first });

    const secondSkip = { ...holdoutSkip, triggerName: 'second_trigger' };
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);
    emitNativeEvent('onPaywallSkipEvent', secondSkip);

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(holdoutSkip);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(secondSkip);
  });

  it('clears the pending handler when the native presentUpsell call throws', () => {
    const onPaywallSkip = jest.fn();
    const onPaywallUnavailable = jest.fn();
    bridge.presentUpsell.mockImplementationOnce(() => {
      throw new Error('native');
    });
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip, onPaywallUnavailable });

    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallUnavailable).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('routes an already-entitled skip to onEntitled when provided', () => {
    const onEntitled = jest.fn();
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled, onPaywallSkip });

    emitNativeEvent('onEntitledEvent', entitledSkip);

    expect(onEntitled).toHaveBeenCalledTimes(1);
    expect(onEntitled).toHaveBeenCalledWith(entitledSkip);
    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('routes an already-entitled skip to onPaywallSkip when onEntitled is not provided', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onEntitledEvent', entitledSkip);

    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).toHaveBeenCalledWith(entitledSkip);
  });

  it('does not call onPaywallSkip after onEntitled consumed an already-entitled skip', () => {
    const onEntitled = jest.fn();
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled, onPaywallSkip });

    emitNativeEvent('onEntitledEvent', entitledSkip);
    emitNativeEvent('onPaywallSkipEvent', entitledSkip);

    expect(onEntitled).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('routes a dedicated already-entitled skip event to onEntitled when provided', () => {
    const onEntitled = jest.fn();
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled, onPaywallSkip });

    emitNativeEvent('onPaywallSkipEvent', entitledSkip);

    expect(onEntitled).toHaveBeenCalledTimes(1);
    expect(onEntitled).toHaveBeenCalledWith(entitledSkip);
    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('routes a dedicated already-entitled skip event to onPaywallSkip when onEntitled is not provided', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onPaywallSkipEvent', entitledSkip);

    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).toHaveBeenCalledWith(entitledSkip);
  });

  it('calls onEntitled once when the dedicated already-entitled skip arrives before the entitled event', () => {
    const onEntitled = jest.fn();
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled, onPaywallSkip });

    emitNativeEvent('onPaywallSkipEvent', entitledSkip);
    emitNativeEvent('onEntitledEvent', entitledSkip);

    expect(onEntitled).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('still dispatches a paywallSkipped entitled payload that is missing skipReason', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onEntitledEvent', { type: 'paywallSkipped', triggerName: 'my_trigger' });

    expect(onPaywallSkip).toHaveBeenCalledWith({
      type: 'paywallSkipped',
      triggerName: 'my_trigger',
      skipReason: 'unknown',
    });
    expect(consoleWarn).toHaveBeenCalledWith(
      '[Helium] paywallSkipped event is missing triggerName or skipReason',
      expect.objectContaining({ type: 'paywallSkipped' })
    );
    consoleWarn.mockRestore();
  });

  it('does not treat an empty entitled payload as a skip', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onEntitledEvent', {});

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('contains an empty native skip payload', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    expect(() => emitNativeEvent('onPaywallSkipEvent', undefined)).not.toThrow();

    expect(onPaywallSkip).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      '[Helium] onPaywallSkipEvent handler failed',
      expect.any(Error)
    );
  });

  it('contains a throwing onPaywallSkip handler', () => {
    const onPaywallSkip = jest.fn(() => {
      throw new Error('boom');
    });
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    expect(() => emitNativeEvent('onPaywallSkipEvent', holdoutSkip)).not.toThrow();
    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[Helium] onPaywallSkip callback failed',
      expect.any(Error)
    );
  });

  it('keeps the pending handler when the global paywallSkipped event arrives first', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onHeliumPaywallEvent', holdoutSkip);
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
  });

  it('clears the pending handler on paywallClose', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onHeliumPaywallEvent', {
      type: 'paywallClose',
      triggerName: 'my_trigger',
      isSecondTry: false,
    });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('keeps the pending handler on a second-try paywallClose', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onHeliumPaywallEvent', {
      type: 'paywallClose',
      triggerName: 'my_trigger',
      isSecondTry: true,
    });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
  });

  it('clears the pending handler on paywallOpenFailed', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onHeliumPaywallEvent', {
      type: 'paywallOpenFailed',
      triggerName: 'my_trigger',
      paywallUnavailableReason: 'bundleFetch404',
    });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('drops the previous handler when a later presentUpsell omits onPaywallSkip', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });
    Helium.presentUpsell({ triggerName: 'my_trigger' });

    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('clears the pending handler on resetHelium', async () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    await Helium.resetHelium();
    await Helium.initialize({ apiKey: 'test-key' });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('passes the entitling event to onEntitled', () => {
    const onEntitled = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled });

    const purchased = { type: 'purchaseSucceeded', productId: 'pro_monthly' };
    emitNativeEvent('onEntitledEvent', purchased);

    expect(onEntitled).toHaveBeenCalledTimes(1);
    expect(onEntitled).toHaveBeenCalledWith(purchased);
  });

  it('still calls a no-arg onEntitled and passes undefined for an empty payload', () => {
    let calls = 0;
    const onEntitled = () => {
      calls += 1;
    };
    const onEntitledSpy = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled });
    emitNativeEvent('onEntitledEvent', {});
    expect(calls).toBe(1);

    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled: onEntitledSpy });
    emitNativeEvent('onEntitledEvent', {});
    expect(onEntitledSpy).toHaveBeenCalledWith(undefined);
  });

  it('contains a throwing onEntitled handler', () => {
    const onEntitled = jest.fn(() => {
      throw new Error('boom');
    });
    Helium.presentUpsell({ triggerName: 'my_trigger', onEntitled });

    expect(() => emitNativeEvent('onEntitledEvent', entitledSkip)).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith(
      '[Helium] onEntitled callback failed',
      expect.any(Error)
    );
  });
});
