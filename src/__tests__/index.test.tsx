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

/** The id the JS layer handed to the native bridge for the most recent presentUpsell call. */
const lastPresentationId = (): string => bridge.presentUpsell.mock.calls.at(-1)?.[4];

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
    expect(bridge.presentUpsell).toHaveBeenCalledWith(
      'my_trigger',
      undefined,
      false,
      false,
      expect.any(String)
    );
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

  it('normalizes an undefined native skip payload', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    expect(() => emitNativeEvent('onPaywallSkipEvent', undefined)).not.toThrow();

    expect(onPaywallSkip).toHaveBeenCalledWith({
      type: 'paywallSkipped',
      triggerName: 'hlm_unknown',
      skipReason: 'unknown',
    });
    expect(consoleWarn).toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
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

  it('normalizes a skip arriving over the skip channel', () => {
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onPaywallSkipEvent', { type: 'paywallSkipped' });

    expect(onPaywallSkip).toHaveBeenCalledWith({
      type: 'paywallSkipped',
      triggerName: 'hlm_unknown',
      skipReason: 'unknown',
    });
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('keeps the skip handler of a paywall re-presented from onPaywallUnavailable', () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const onPaywallSkip = jest.fn();
    const onPaywallUnavailable = jest.fn(() => {
      Helium.presentUpsell({ triggerName: 'second', onPaywallSkip });
    });
    Helium.presentUpsell({ triggerName: 'first', onPaywallUnavailable });

    emitNativeEvent('onPaywallUnavailableEvent', {
      type: 'paywallOpenFailed',
      triggerName: 'first',
      paywallUnavailableReason: 'notInitialized',
      presentationId: lastPresentationId(),
    });
    emitNativeEvent('onPaywallSkipEvent', { ...holdoutSkip, triggerName: 'second' });

    expect(onPaywallUnavailable).toHaveBeenCalledTimes(1);
    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
    consoleLog.mockRestore();
  });

  it('contains a throwing onPaywallUnavailable handler on paywallOpenFailed', () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    const onPaywallUnavailable = jest.fn(() => {
      throw new Error('boom');
    });
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallUnavailable });

    expect(() =>
      emitNativeEvent('onPaywallUnavailableEvent', {
        type: 'paywallOpenFailed',
        triggerName: 'my_trigger',
        paywallUnavailableReason: 'notInitialized',
        presentationId: lastPresentationId(),
      })
    ).not.toThrow();

    expect(onPaywallUnavailable).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      '[Helium] onPaywallUnavailable callback failed',
      expect.any(Error)
    );
    consoleLog.mockRestore();
  });

  it('clears the pending handler on paywallClose', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('paywallEventHandlers', {
      type: 'paywallClose',
      triggerName: 'my_trigger',
      isSecondTry: false,
      presentationId: lastPresentationId(),
    });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('keeps the pending handler on a second-try paywallClose', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('paywallEventHandlers', {
      type: 'paywallClose',
      triggerName: 'my_trigger',
      isSecondTry: true,
      presentationId: lastPresentationId(),
    });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).toHaveBeenCalledTimes(1);
  });

  it('clears the pending handler on paywallOpenFailed', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });

    emitNativeEvent('onPaywallUnavailableEvent', {
      type: 'paywallOpenFailed',
      triggerName: 'my_trigger',
      paywallUnavailableReason: 'bundleFetch404',
      presentationId: lastPresentationId(),
    });
    emitNativeEvent('onPaywallSkipEvent', holdoutSkip);

    expect(onPaywallSkip).not.toHaveBeenCalled();
  });

  it('routes a skip to the present that registered the handler', () => {
    const onPaywallSkip = jest.fn();
    Helium.presentUpsell({ triggerName: 'my_trigger', onPaywallSkip });
    Helium.presentUpsell({ triggerName: 'my_trigger' });

    emitNativeEvent('onPaywallSkipEvent', { ...holdoutSkip, presentationId: lastPresentationId() });

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

describe('fallback bundle', () => {
  const fallbackBundle = { paywalls: [{ id: 'fallback' }] };
  const fallbackBundleString = JSON.stringify(fallbackBundle);
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
    jest.dontMock('expo-file-system');
  });

  const initializeIsolated = async () => {
    let isolatedBridge: typeof bridge;
    let initialized: Promise<void> | undefined;
    jest.isolateModules(() => {
      isolatedBridge = require('react-native').NativeModules.HeliumBridge;
      const isolatedHelium: typeof Helium = require('../index');
      initialized = isolatedHelium.initialize({ apiKey: 'test-key', fallbackBundle });
    });
    await initialized;
    return isolatedBridge!;
  };

  it('passes the bundle as a string when expo-file-system cannot be required', async () => {
    jest.doMock(
      'expo-file-system',
      () => {
        throw new Error('Requiring unknown module "undefined".');
      },
      { virtual: true }
    );

    const isolatedBridge = await initializeIsolated();

    expect(isolatedBridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackBundleString, fallbackBundleUrlString: undefined })
    );
    expect(consoleLog).toHaveBeenCalledWith(
      '[Helium] expo-file-system not available, passing fallback bundle as string.'
    );
  });

  it('passes the bundle as a string when expo-file-system has no document directory', async () => {
    const writeAsStringAsync = jest.fn();
    jest.doMock('expo-file-system', () => ({ documentDirectory: null, writeAsStringAsync }), {
      virtual: true,
    });

    const isolatedBridge = await initializeIsolated();

    expect(writeAsStringAsync).not.toHaveBeenCalled();
    expect(isolatedBridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackBundleString, fallbackBundleUrlString: undefined })
    );
  });

  it('writes the bundle to disk and passes its URL when expo-file-system is available', async () => {
    const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
    jest.doMock(
      'expo-file-system',
      () => ({ documentDirectory: 'file:///documents/', writeAsStringAsync }),
      { virtual: true }
    );

    const isolatedBridge = await initializeIsolated();

    expect(writeAsStringAsync).toHaveBeenCalledWith(
      'file:///documents/helium-fallback.json',
      fallbackBundleString
    );
    expect(isolatedBridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackBundleUrlString: 'file:///documents/helium-fallback.json',
        fallbackBundleString: undefined,
      })
    );
  });

  it('passes the bundle as a string when writing it to disk fails', async () => {
    jest.doMock(
      'expo-file-system',
      () => ({
        documentDirectory: 'file:///documents/',
        writeAsStringAsync: jest.fn().mockRejectedValue(new Error('disk full')),
      }),
      { virtual: true }
    );

    const isolatedBridge = await initializeIsolated();

    expect(isolatedBridge.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackBundleString, fallbackBundleUrlString: undefined })
    );
  });
});

describe('presentation routing', () => {
  const TRIGGER = 'go_online';
  const OTHER_TRIGGER = 'go_offline';
  const PREVIEW_TRIGGER = 'helium_preview_trigger';
  const idOfCall = (index: number): string => bridge.presentUpsell.mock.calls[index][4];
  const perCall = (
    presentationId: string,
    type: string,
    triggerName = TRIGGER,
    extra: Record<string, unknown> = {}
  ) =>
    emitNativeEvent('paywallEventHandlers', {
      type,
      triggerName,
      paywallName: 'test-paywall',
      presentationId,
      ...extra,
    });
  const emitGlobal = (event: Record<string, unknown>) =>
    emitNativeEvent('onHeliumPaywallEvent', { paywallName: 'test-paywall', ...event });
  const eventTypes = (handler: jest.Mock) => handler.mock.calls.map(([event]) => event.type);
  let consoleLog: jest.SpyInstance;

  beforeEach(async () => {
    await Helium.resetHelium();
    await Helium.initialize({ apiKey: 'test-key' });
    bridge.presentUpsell.mockClear();
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
  });

  const presentAndOpen = () => {
    const onAnyEvent = jest.fn();
    const onPaywallUnavailable = jest.fn();
    Helium.presentUpsell({
      triggerName: TRIGGER,
      eventHandlers: { onAnyEvent },
      onPaywallUnavailable,
    });
    const id = idOfCall(0);
    perCall(id, 'paywallOpen');
    return { id, onAnyEvent, onPaywallUnavailable };
  };

  it('keeps the on-screen presentation when a repeat present is rejected as already presented', () => {
    const { id, onAnyEvent, onPaywallUnavailable } = presentAndOpen();
    const rejected = jest.fn();
    const rejectedUnavailable = jest.fn();

    Helium.presentUpsell({
      triggerName: TRIGGER,
      eventHandlers: { onAnyEvent: rejected },
      onPaywallUnavailable: rejectedUnavailable,
    });
    const rejectedId = idOfCall(1);
    emitGlobal({
      type: 'paywallOpenFailed',
      triggerName: TRIGGER,
      paywallUnavailableReason: 'alreadyPresented',
    });
    perCall(id, 'purchasePressed');
    perCall(id, 'purchaseCancelled');
    perCall(id, 'purchaseRestoreFailed');
    perCall(rejectedId, 'purchasePressed');

    expect(eventTypes(onAnyEvent)).toEqual([
      'paywallOpen',
      'purchasePressed',
      'purchaseCancelled',
      'purchaseRestoreFailed',
    ]);
    expect(rejected).not.toHaveBeenCalled();
    expect(rejectedUnavailable).not.toHaveBeenCalled();
    expect(onPaywallUnavailable).not.toHaveBeenCalled();
  });

  it('drops the rejected present when native reports the rejection on its own channel', () => {
    const { id, onAnyEvent } = presentAndOpen();
    const rejected = jest.fn();

    Helium.presentUpsell({ triggerName: TRIGGER, eventHandlers: { onAnyEvent: rejected } });
    const rejectedId = idOfCall(1);
    perCall(rejectedId, 'paywallOpenFailed', TRIGGER, {
      paywallUnavailableReason: 'alreadyPresented',
    });
    emitGlobal({
      type: 'paywallOpenFailed',
      triggerName: TRIGGER,
      paywallUnavailableReason: 'alreadyPresented',
    });
    perCall(id, 'purchasePressed');
    perCall(rejectedId, 'purchasePressed');

    expect(eventTypes(onAnyEvent)).toEqual(['paywallOpen', 'purchasePressed']);
    expect(eventTypes(rejected)).toEqual(['paywallOpenFailed']);
  });

  it('keeps the first present when a same-trigger repeat lands before it opens', () => {
    const first = jest.fn();
    const rejected = jest.fn();

    Helium.presentUpsell({ triggerName: TRIGGER, eventHandlers: { onAnyEvent: first } });
    Helium.presentUpsell({ triggerName: TRIGGER, eventHandlers: { onAnyEvent: rejected } });
    const firstId = idOfCall(0);
    const rejectedId = idOfCall(1);
    perCall(firstId, 'paywallOpen');
    emitGlobal({
      type: 'paywallOpenFailed',
      triggerName: TRIGGER,
      paywallUnavailableReason: 'alreadyPresented',
    });
    perCall(firstId, 'purchasePressed');
    perCall(rejectedId, 'purchasePressed');

    expect(eventTypes(first)).toEqual(['paywallOpen', 'purchasePressed']);
    expect(rejected).not.toHaveBeenCalled();
  });

  it('delivers preview events to the host handlers without ending the presentation', () => {
    const { id, onAnyEvent } = presentAndOpen();

    perCall(id, 'paywallOpen', PREVIEW_TRIGGER);
    perCall(id, 'purchaseRestoreFailed', PREVIEW_TRIGGER);
    perCall(id, 'paywallClose', PREVIEW_TRIGGER, { isSecondTry: false });
    perCall(id, 'purchasePressed');

    expect(eventTypes(onAnyEvent)).toEqual([
      'paywallOpen',
      'paywallOpen',
      'purchaseRestoreFailed',
      'paywallClose',
      'purchasePressed',
    ]);
  });

  it('routes a skip to the present that registered it', () => {
    const firstSkip = jest.fn();
    const second = jest.fn();
    const secondSkip = jest.fn();

    Helium.presentUpsell({ triggerName: TRIGGER, onPaywallSkip: firstSkip });
    Helium.presentUpsell({
      triggerName: OTHER_TRIGGER,
      eventHandlers: { onAnyEvent: second },
      onPaywallSkip: secondSkip,
    });
    emitNativeEvent('onPaywallSkipEvent', {
      type: 'paywallSkipped',
      triggerName: TRIGGER,
      skipReason: 'targetingHoldout',
      presentationId: idOfCall(0),
    });
    perCall(idOfCall(1), 'paywallOpen', OTHER_TRIGGER);
    perCall(idOfCall(1), 'purchasePressed', OTHER_TRIGGER);

    expect(firstSkip).toHaveBeenCalledTimes(1);
    expect(secondSkip).not.toHaveBeenCalled();
    expect(eventTypes(second)).toEqual(['paywallOpen', 'purchasePressed']);
  });

  it("routes an already-entitled skip to that present's onEntitled", () => {
    const firstEntitled = jest.fn();
    const secondEntitled = jest.fn();

    Helium.presentUpsell({ triggerName: TRIGGER, onEntitled: firstEntitled });
    Helium.presentUpsell({ triggerName: OTHER_TRIGGER, onEntitled: secondEntitled });
    emitNativeEvent('onEntitledEvent', {
      type: 'paywallSkipped',
      triggerName: TRIGGER,
      skipReason: 'alreadyEntitled',
      presentationId: idOfCall(0),
    });

    expect(firstEntitled).toHaveBeenCalledTimes(1);
    expect(secondEntitled).not.toHaveBeenCalled();
  });

  it('routes an open failure to the present that failed', () => {
    const firstUnavailable = jest.fn();
    const second = jest.fn();
    const secondUnavailable = jest.fn();

    Helium.presentUpsell({ triggerName: TRIGGER, onPaywallUnavailable: firstUnavailable });
    Helium.presentUpsell({
      triggerName: OTHER_TRIGGER,
      eventHandlers: { onAnyEvent: second },
      onPaywallUnavailable: secondUnavailable,
    });
    emitNativeEvent('onPaywallUnavailableEvent', {
      type: 'paywallOpenFailed',
      triggerName: TRIGGER,
      paywallUnavailableReason: 'paywallsNotDownloaded',
      presentationId: idOfCall(0),
    });
    perCall(idOfCall(1), 'paywallOpen', OTHER_TRIGGER);

    expect(firstUnavailable).toHaveBeenCalledTimes(1);
    expect(secondUnavailable).not.toHaveBeenCalled();
    expect(eventTypes(second)).toEqual(['paywallOpen']);
  });

  it('ends a presentation on its own close but still delivers a later entitled event', () => {
    const onAnyEvent = jest.fn();
    const onEntitled = jest.fn();

    Helium.presentUpsell({ triggerName: TRIGGER, eventHandlers: { onAnyEvent }, onEntitled });
    const id = idOfCall(0);
    perCall(id, 'paywallOpen');
    perCall(id, 'paywallClose', TRIGGER, { isSecondTry: false });
    perCall(id, 'purchasePressed');
    emitNativeEvent('onEntitledEvent', {
      type: 'purchaseSucceeded',
      triggerName: TRIGGER,
      presentationId: id,
    });
    emitNativeEvent('onEntitledEvent', {
      type: 'purchaseSucceeded',
      triggerName: TRIGGER,
      presentationId: id,
    });

    expect(eventTypes(onAnyEvent)).toEqual(['paywallOpen', 'paywallClose']);
    expect(onEntitled).toHaveBeenCalledTimes(1);
  });

  it('ignores close and skipped events on the global channel', () => {
    const { id, onAnyEvent } = presentAndOpen();

    emitGlobal({ type: 'paywallClose', triggerName: TRIGGER, isSecondTry: false });
    emitGlobal({ type: 'paywallSkipped', triggerName: TRIGGER, skipReason: 'targetingHoldout' });
    perCall(id, 'purchasePressed');

    expect(eventTypes(onAnyEvent)).toEqual(['paywallOpen', 'purchasePressed']);
  });

  it('still clears the handlers and reports a real open failure', () => {
    const { id, onAnyEvent, onPaywallUnavailable } = presentAndOpen();

    emitNativeEvent('onPaywallUnavailableEvent', {
      type: 'paywallOpenFailed',
      triggerName: TRIGGER,
      paywallUnavailableReason: 'webviewRenderFail',
      presentationId: id,
    });
    perCall(id, 'purchasePressed');

    expect(eventTypes(onAnyEvent)).toEqual(['paywallOpen']);
    expect(onPaywallUnavailable).toHaveBeenCalledTimes(1);
  });

  it('clears every presentation on reset', async () => {
    const { id, onAnyEvent } = presentAndOpen();

    await Helium.resetHelium();
    await Helium.initialize({ apiKey: 'test-key' });
    perCall(id, 'purchasePressed');

    expect(eventTypes(onAnyEvent)).toEqual(['paywallOpen']);
  });
});
