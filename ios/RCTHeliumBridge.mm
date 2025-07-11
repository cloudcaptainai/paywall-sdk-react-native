//
//  RCTHeliumBridge.mm
//  HeliumBridgeNative
//
//  Created by Anish Doshi on 2/11/25.
//

#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import "PaywallSdkReactNative-Bridging-Header.h"

#ifdef RCT_NEW_ARCH_ENABLED
#import <ReactCommon/RCTTurboModule.h>
#import "NativeHeliumBridgeSpec.h"
#endif // RCT_NEW_ARCH_ENABLED

@interface RCT_EXTERN_MODULE(HeliumBridge, RCTEventEmitter)

#ifdef RCT_NEW_ARCH_ENABLED
<NativeHeliumBridgeSpec>
#endif // RCT_NEW_ARCH_ENABLED

RCT_EXTERN_METHOD(
    initialize:(NSDictionary *)config
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

- (NSArray<NSString *> *)supportedEvents;

#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeHeliumBridgeSpecJSI>(params);
}
#endif // RCT_NEW_ARCH_ENABLED

@end
