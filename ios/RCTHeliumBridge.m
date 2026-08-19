//
//  RCTHeliumBridge.m
//  HeliumBridgeNative
//
//  Created by Anish Doshi on 2/11/25.
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import "PaywallSdkReactNative-Bridging-Header.h"

@interface RCT_EXTERN_MODULE(HeliumBridge, NSObject)

RCT_EXTERN_METHOD(
    initialize:(NSDictionary *)config
)

RCT_EXTERN_METHOD(
    presentUpsell:(NSString *)trigger
    customPaywallTraits:(NSDictionary *)customPaywallTraits
    dontShowIfAlreadyEntitled:(BOOL)dontShowIfAlreadyEntitled
    androidDisableSystemBackNavigation:(BOOL)androidDisableSystemBackNavigation
)

RCT_EXTERN_METHOD(
    hideUpsell
)

RCT_EXTERN_METHOD(
    hideAllUpsells
)

RCT_EXTERN_METHOD(
    getDownloadStatus:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    handlePurchaseResult:(NSString *)statusString
    error:(NSString *)errorMsg
    transactionId:(NSString *)transactionId
    originalTransactionId:(NSString *)originalTransactionId
    productId:(NSString *)productId
)

RCT_EXTERN_METHOD(
    handleRestoreResult:(BOOL)success
)

RCT_EXTERN_METHOD(
    fallbackOpenOrCloseEvent:(NSString *)trigger
    isOpen:(BOOL)isOpen
    viewType:(NSString *)viewType
)

RCT_EXTERN_METHOD(
    getPaywallInfo:(NSString *)trigger
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    handleDeepLink:(NSString *)urlString
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    setRevenueCatAppUserId:(NSString *)rcAppUserId
)

RCT_EXTERN_METHOD(
    setCustomUserId:(NSString *)newUserId
)

RCT_EXTERN_METHOD(
    getCustomUserId:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    setThirdPartyAnalyticsAnonymousId:(NSString *)anonymousId
)

RCT_EXTERN_METHOD(
    hasEntitlementForPaywall:(NSString *)trigger
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    hasAnyActiveSubscription:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    hasAnyEntitlement:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    getExperimentInfoForTrigger:(NSString *)trigger
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    disableRestoreFailedDialog
)

RCT_EXTERN_METHOD(
    setCustomRestoreFailedStrings:(NSString *)customTitle
    customMessage:(NSString *)customMessage
    customCloseButtonText:(NSString *)customCloseButtonText
)

RCT_EXTERN_METHOD(
    resetHelium:(BOOL)clearUserTraits
    clearHeliumEventListeners:(BOOL)clearHeliumEventListeners
    clearExperimentAllocations:(BOOL)clearExperimentAllocations
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    setLightDarkModeOverride:(NSString *)mode
)

RCT_EXTERN_METHOD(
    setPaywallPreviewsAutoEnabledInDevBuilds:(BOOL)enabled
)

RCT_EXTERN_METHOD(
    setTestPurchaseResult:(NSString *)result
)

RCT_EXTERN_METHOD(
    setTestRestoreResult:(BOOL)success
)

RCT_EXTERN_METHOD(
    setTestIntroOfferEligibility:(BOOL)eligible
)

RCT_EXTERN_METHOD(
    resetTesting
)

RCT_EXTERN_METHOD(
    heliumHandleURL:(NSString *)urlString
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    enableExternalWebCheckout:(NSString *)redirectURL
    paymentProcessors:(NSArray *)paymentProcessors
)

RCT_EXTERN_METHOD(
    enableExternalWebCheckoutSuccessAndCancel:(NSString *)successURL
    cancelURL:(NSString *)cancelURL
    paymentProcessors:(NSArray *)paymentProcessors
)

RCT_EXTERN_METHOD(
    disableExternalWebCheckout
)

RCT_EXTERN_METHOD(
    setAllowWebCheckoutWithoutUserId:(BOOL)allow
)

RCT_EXTERN_METHOD(
    hasActiveStripeEntitlement:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    hasActivePaddleEntitlement:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    createStripePortalSession:(NSString *)returnUrl
    resolver:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    resetStripeEntitlements
)

RCT_EXTERN_METHOD(
    createPaddlePortalSession:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    getPaddleCustomerId:(RCTPromiseResolveBlock)resolve
    rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
    resetPaddleEntitlements
)

@end
