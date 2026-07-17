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
    expect(config.onHeliumEvent).toBeUndefined();
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

  it('purchases the subscription option matching basePlanId when no offer matches', async () => {
    const options = [{ id: 'monthly' }, { id: 'annual' }];
    mockPurchases.getProducts.mockResolvedValue([product('pro_monthly', options)]);
    mockPurchases.purchaseSubscriptionOption.mockResolvedValue(purchaseResult('pro_monthly'));
    const config = createRevenueCatPurchaseConfig();

    const result = await config.makePurchaseAndroid!('pro_monthly', 'monthly');

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
});
