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
    customVariableValues:(NSDictionary *)config
)

RCT_EXTERN_METHOD(
    presentUpsell:(NSString *)trigger
    customPaywallTraits:(NSDictionary *)customPaywallTraits
)

RCT_EXTERN_METHOD(
    getFetchedTriggerNames: (RCTResponseSenderBlock)callback
)

RCT_EXTERN_METHOD(
    hideUpsell
)

RCT_EXTERN_METHOD(
    hideAllUpsells
)

RCT_EXTERN_METHOD(
    handlePurchaseResponse:(NSDictionary *)response
)

RCT_EXTERN_METHOD(
    handleRestoreResponse:(NSDictionary *)response
)

RCT_EXTERN_METHOD(
    fallbackOpenOrCloseEvent:(NSString *)trigger
    isOpen:(BOOL)isOpen
    viewType:(NSString *)viewType
)

RCT_EXTERN_METHOD(
    getPaywallInfo:(NSString *)trigger
    callback:(RCTResponseSenderBlock)callback
)

RCT_EXTERN_METHOD(
    handleDeepLink:(NSString *)urlString
    callback:(RCTResponseSenderBlock)callback
)

RCT_EXTERN_METHOD(
    setRevenueCatAppUserId:(NSString *)rcAppUserId
)

RCT_EXTERN_METHOD(
    setCustomUserId:(NSString *)newUserId
)

RCT_EXTERN_METHOD(
    hasEntitlementForPaywall:(NSString *)trigger
    callback:(RCTResponseSenderBlock)callback
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
    callback:(RCTResponseSenderBlock)callback
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
    resetHelium
)

RCT_EXTERN_METHOD(
    setLightDarkModeOverride:(NSString *)mode
)

@end
