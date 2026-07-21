import Purchases, { PURCHASES_ERROR_CODE } from 'react-native-purchases';
import type { CustomerInfo, PurchasesStoreProduct } from 'react-native-purchases';
import { createRevenueCatPurchaseConfig } from '../handlers/revenuecat';
import { setRevenueCatAppUserId } from '../native-interface';

jest.mock('../native-interface', () => ({
  setRevenueCatAppUserId: jest.fn(),
}));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(),
    configure: jest.fn(),
    getAppUserID: jest.fn(),
    getProducts: jest.fn(),
    purchaseStoreProduct: jest.fn(),
    purchaseSubscriptionOption: jest.fn(),
    restorePurchases: jest.fn(),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    invalidateCustomerInfoCache: jest.fn(),
    getCustomerInfo: jest.fn(),
  },
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    STORE_PROBLEM_ERROR: '2',
    MISSING_RECEIPT_FILE_ERROR: '9',
    NETWORK_ERROR: '10',
    UNKNOWN_BACKEND_ERROR: '16',
    PAYMENT_PENDING_ERROR: '20',
  },
  PRODUCT_CATEGORY: {
    NON_SUBSCRIPTION: 'NON_SUBSCRIPTION',
    SUBSCRIPTION: 'SUBSCRIPTION',
  },
}));

const mockPurchases = jest.mocked(Purchases);

const product = (identifier: string, subscriptionOptions?: Array<{ id: string }>) =>
  ({ identifier, subscriptionOptions }) as unknown as PurchasesStoreProduct;

const activeCustomerInfo = (productId: string) =>
  ({
    entitlements: { active: { premium: { productIdentifier: productId } } },
    activeSubscriptions: [productId],
    allPurchasedProductIdentifiers: [productId],
  }) as unknown as CustomerInfo;

const purchaseResult = (productId: string, transactionId?: string) =>
  ({
    customerInfo: activeCustomerInfo(productId),
    transaction: transactionId ? { transactionIdentifier: transactionId } : undefined,
  }) as never;

const rcError = (code: string, underlyingErrorMessage?: string) =>
  Object.assign(new Error('rc failure'), { code, underlyingErrorMessage });

const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  mockPurchases.isConfigured.mockResolvedValue(false);
  mockPurchases.getAppUserID.mockResolvedValue('rc-user');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('createRevenueCatPurchaseConfig', () => {
  it('returns platform purchase handlers and the RevenueCat delegate type', () => {
    const config = createRevenueCatPurchaseConfig();

    expect(typeof config.makePurchaseIOS).toBe('function');
    expect(typeof config.makePurchaseAndroid).toBe('function');
    expect(typeof config.restorePurchases).toBe('function');
    expect(config._delegateType).toBe('h_revenuecat');
    expect(config.makePurchase).toBeUndefined();
    expect(typeof config.onHeliumEvent).toBe('function');
  });

  it('configures RevenueCat with the provided api key when not already configured', async () => {
    createRevenueCatPurchaseConfig({ apiKey: 'rc-key' });
    await flushMicrotasks();

    expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'rc-key' });
  });

  it('ignores the provided api key when RevenueCat is already configured', async () => {
    mockPurchases.isConfigured.mockResolvedValue(true);

    createRevenueCatPurchaseConfig({ apiKey: 'rc-key' });
    await flushMicrotasks();

    expect(mockPurchases.configure).not.toHaveBeenCalled();
  });

  it('syncs the RevenueCat app user id to the native SDK', async () => {
    createRevenueCatPurchaseConfig();
    await flushMicrotasks();

    expect(setRevenueCatAppUserId).toHaveBeenCalledWith('rc-user');
  });
});

describe('makePurchaseIOS', () => {
  it('purchases the product and returns transaction and product ids', async () => {
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly')]);
    mockPurchases.purchaseStoreProduct.mockResolvedValue(purchaseResult('pro_monthly', 'txn-1'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseIOS!('pro_monthly');

    expect(result).toEqual({
      status: 'purchased',
      transactionId: 'txn-1',
      productId: 'pro_monthly',
    });
  });

  it('retries once after a transient store error and succeeds', async () => {
    jest.useFakeTimers();
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly')]);
    mockPurchases.purchaseStoreProduct
      .mockRejectedValueOnce(rcError(PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR))
      .mockResolvedValueOnce(purchaseResult('pro_monthly', 'txn-2'));
    const config = createRevenueCatPurchaseConfig();

    const resultPromise = config.makePurchaseIOS!('pro_monthly');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(mockPurchases.purchaseStoreProduct).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('purchased');
  });

  it('fails after the retry when the product is never found', async () => {
    jest.useFakeTimers();
    mockPurchases.getProducts.mockResolvedValue([]);
    const config = createRevenueCatPurchaseConfig();

    const resultPromise = config.makePurchaseIOS!('missing_product');
    await jest.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    expect(result.error).toContain('product not found: missing_product');
    expect(mockPurchases.getProducts).toHaveBeenCalledTimes(2);
    expect(mockPurchases.purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it('maps a payment pending error to pending without retrying', async () => {
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly')]);
    mockPurchases.purchaseStoreProduct.mockRejectedValue(
      rcError(PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR)
    );
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseIOS!('pro_monthly');

    expect(result.status).toBe('pending');
    expect(mockPurchases.purchaseStoreProduct).toHaveBeenCalledTimes(1);
  });

  it('maps a cancellation to cancelled without retrying', async () => {
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly')]);
    mockPurchases.purchaseStoreProduct.mockRejectedValue(
      rcError(PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
    );
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseIOS!('pro_monthly');

    expect(result.status).toBe('cancelled');
    expect(mockPurchases.purchaseStoreProduct).toHaveBeenCalledTimes(1);
  });

  it('reports non-retryable errors with code and underlying message', async () => {
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly')]);
    mockPurchases.purchaseStoreProduct.mockRejectedValue(rcError('23', 'receipt already in use'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseIOS!('pro_monthly');

    expect(result.status).toBe('failed');
    expect(result.error).toContain('[RevenueCat]');
    expect(result.error).toContain('code: 23');
    expect(result.error).toContain('receipt already in use');
    expect(mockPurchases.purchaseStoreProduct).toHaveBeenCalledTimes(1);
  });
});

describe('makePurchaseAndroid', () => {
  it('purchases the subscription option matching basePlanId:offerId', async () => {
    const options = [{ id: 'monthly' }, { id: 'monthly:intro' }];
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly', options)]);
    mockPurchases.purchaseSubscriptionOption.mockResolvedValue(purchaseResult('pro_monthly'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseAndroid!('pro_monthly', 'monthly', 'intro');

    expect(mockPurchases.purchaseSubscriptionOption).toHaveBeenCalledWith(options[1]);
    expect(result.status).toBe('purchased');
  });

  it('purchases the subscription option matching basePlanId when only a base plan is provided', async () => {
    const options = [{ id: 'monthly' }, { id: 'annual' }];
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly', options)]);
    mockPurchases.purchaseSubscriptionOption.mockResolvedValue(purchaseResult('pro_monthly'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseAndroid!('pro_monthly', 'monthly');

    expect(mockPurchases.purchaseSubscriptionOption).toHaveBeenCalledWith(options[0]);
    expect(result.status).toBe('purchased');
  });

  it('purchases the base plan option when the requested offer does not exist', async () => {
    const options = [{ id: 'monthly' }, { id: 'monthly:intro' }];
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly', options)]);
    mockPurchases.purchaseSubscriptionOption.mockResolvedValue(purchaseResult('pro_monthly'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseAndroid!('pro_monthly', 'monthly', 'no_such_offer');

    expect(mockPurchases.purchaseSubscriptionOption).toHaveBeenCalledWith(options[0]);
    expect(result.status).toBe('purchased');
  });

  it('purchases via product lookup when no base plan or offer is provided', async () => {
    mockPurchases.getProducts.mockResolvedValue([product('coins_100')]);
    mockPurchases.purchaseStoreProduct.mockResolvedValue(purchaseResult('coins_100'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseAndroid!('coins_100');

    expect(mockPurchases.purchaseSubscriptionOption).not.toHaveBeenCalled();
    expect(mockPurchases.purchaseStoreProduct).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      status: 'purchased',
      transactionId: undefined,
      productId: 'coins_100',
    });
  });
});

describe('restorePurchases', () => {
  it('returns true when the restored customer has an active entitlement', async () => {
    mockPurchases.restorePurchases.mockResolvedValue(activeCustomerInfo('pro_monthly'));
    const config = createRevenueCatPurchaseConfig();

    await expect(config.restorePurchases()).resolves.toBe(true);
  });

  it('returns false when the restored customer has no active entitlements', async () => {
    mockPurchases.restorePurchases.mockResolvedValue({
      entitlements: { active: {} },
    } as unknown as CustomerInfo);
    const config = createRevenueCatPurchaseConfig();

    await expect(config.restorePurchases()).resolves.toBe(false);
  });

  it('returns false when restore throws', async () => {
    mockPurchases.restorePurchases.mockRejectedValue(new Error('network down'));
    const config = createRevenueCatPurchaseConfig();

    await expect(config.restorePurchases()).resolves.toBe(false);
  });

  it('waits for setup to finish before calling restore', async () => {
    let finishConfiguredCheck!: (configured: boolean) => void;
    mockPurchases.isConfigured.mockReturnValue(
      new Promise((resolve) => {
        finishConfiguredCheck = resolve;
      })
    );
    mockPurchases.restorePurchases.mockResolvedValue(activeCustomerInfo('pro_monthly'));
    const config = createRevenueCatPurchaseConfig({ apiKey: 'rc-key' });

    const restorePromise = config.restorePurchases();
    await flushMicrotasks();
    expect(mockPurchases.restorePurchases).not.toHaveBeenCalled();

    finishConfiguredCheck(false);
    await expect(restorePromise).resolves.toBe(true);
    expect(mockPurchases.configure).toHaveBeenCalledWith({ apiKey: 'rc-key' });
  });
});

describe('third-party payment sync (Stripe/Paddle)', () => {
  const succeededEvent = (paymentProcessor?: string) =>
    ({ type: 'purchaseSucceeded', paymentProcessor }) as never;

  it('exposes onHeliumEvent on the purchase config', () => {
    const config = createRevenueCatPurchaseConfig();
    expect(typeof config.onHeliumEvent).toBe('function');
  });

  it('polls RevenueCat after a Stripe web purchase', async () => {
    jest.useFakeTimers();
    const config = createRevenueCatPurchaseConfig();
    config.onHeliumEvent!(succeededEvent('stripe'));

    // Let the baseline snapshot resolve so the listener gets registered.
    await jest.advanceTimersByTimeAsync(0);
    expect(mockPurchases.addCustomerInfoUpdateListener).toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockPurchases.invalidateCustomerInfoCache).toHaveBeenCalled();
    expect(mockPurchases.getCustomerInfo).toHaveBeenCalled();

    // Run out the remaining poll phases (~50s total) and confirm cleanup.
    await jest.advanceTimersByTimeAsync(50_000);
    expect(mockPurchases.removeCustomerInfoUpdateListener).toHaveBeenCalled();
  });

  it('stops polling early once entitlements actually change', async () => {
    jest.useFakeTimers();
    const config = createRevenueCatPurchaseConfig();
    config.onHeliumEvent!(succeededEvent('paddle'));

    await jest.advanceTimersByTimeAsync(0);
    const listener = mockPurchases.addCustomerInfoUpdateListener.mock.calls[0]![0]!;
    await jest.advanceTimersByTimeAsync(1000);
    const callsAfterFirstPoll = mockPurchases.invalidateCustomerInfoCache.mock.calls.length;
    listener(activeCustomerInfo('pro_monthly'));

    await jest.advanceTimersByTimeAsync(1000);
    expect(mockPurchases.invalidateCustomerInfoCache.mock.calls.length).toBe(callsAfterFirstPoll);
    expect(mockPurchases.removeCustomerInfoUpdateListener).toHaveBeenCalled();
  });

  it('keeps polling when emitted customer info matches the baseline', async () => {
    jest.useFakeTimers();
    const config = createRevenueCatPurchaseConfig();
    config.onHeliumEvent!(succeededEvent('stripe'));

    await jest.advanceTimersByTimeAsync(0);
    const listener = mockPurchases.addCustomerInfoUpdateListener.mock.calls[0]![0]!;
    await jest.advanceTimersByTimeAsync(1000);
    const callsAfterFirstPoll = mockPurchases.invalidateCustomerInfoCache.mock.calls.length;
    listener({} as never);

    await jest.advanceTimersByTimeAsync(50_000);
    expect(mockPurchases.invalidateCustomerInfoCache.mock.calls.length).toBeGreaterThan(
      callsAfterFirstPoll
    );
    expect(mockPurchases.removeCustomerInfoUpdateListener).toHaveBeenCalled();
  });

  it('keeps polling on stale info when the baseline fetch fails', async () => {
    jest.useFakeTimers();
    mockPurchases.getCustomerInfo
      .mockRejectedValueOnce(new Error('network down')) // baseline fetch
      .mockResolvedValueOnce({} as never) // first poll: still stale
      .mockResolvedValue(activeCustomerInfo('pro_monthly')); // second poll: fresh
    const config = createRevenueCatPurchaseConfig();
    config.onHeliumEvent!(succeededEvent('stripe'));

    await jest.advanceTimersByTimeAsync(0);
    expect(mockPurchases.addCustomerInfoUpdateListener).toHaveBeenCalled();

    // First poll adopts the stale info as the baseline and must keep polling.
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockPurchases.removeCustomerInfoUpdateListener).not.toHaveBeenCalled();

    // Second poll sees changed entitlements and stops.
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockPurchases.removeCustomerInfoUpdateListener).toHaveBeenCalled();
    const pollCalls = mockPurchases.invalidateCustomerInfoCache.mock.calls.length;
    await jest.advanceTimersByTimeAsync(50_000);
    expect(mockPurchases.invalidateCustomerInfoCache.mock.calls.length).toBe(pollCalls);
  });

  it('does not sync when the processor sync is disabled', async () => {
    jest.useFakeTimers();
    const config = createRevenueCatPurchaseConfig({
      disableStripePurchaseSync: true,
    });
    config.onHeliumEvent!(succeededEvent('stripe'));

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockPurchases.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
    expect(mockPurchases.invalidateCustomerInfoCache).not.toHaveBeenCalled();
  });

  it('does not sync for app store purchases or non-purchase events', async () => {
    jest.useFakeTimers();
    const config = createRevenueCatPurchaseConfig();
    config.onHeliumEvent!(succeededEvent('appStore'));
    config.onHeliumEvent!(succeededEvent(undefined));
    config.onHeliumEvent!({ type: 'paywallOpen' } as never);

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockPurchases.addCustomerInfoUpdateListener).not.toHaveBeenCalled();
  });
});
