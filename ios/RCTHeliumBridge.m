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

@end
