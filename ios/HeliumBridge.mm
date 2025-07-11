#import "HeliumBridge.h"
// #import "Freshpaywallrn-Bridging-Header.h"

@implementation HeliumBridge
RCT_EXPORT_MODULE()

// - (instancetype)init {
//     if (self = [super init]) {
//         [[HeliumBridge shared] setTurboModule:self];
//     }
//     return self;
// }

- (void)initialize:(NSDictionary *)config {
NSLog(@"Initialize called with config: %@", config);
//     NSString *apiKey = config[@"apiKey"];
//     NSNumber *fallbackPaywallTag = config[@"fallbackPaywall"];
//     NSArray *triggers = config[@"triggers"];
//     // ... extract other parameters
//
//     [[HeliumBridge shared] initializeWithApiKey:apiKey
//                              fallbackPaywallTag:fallbackPaywallTag
//                                        triggers:triggers
//                                    customUserId:config[@"customUserId"]
//                               customAPIEndpoint:config[@"customAPIEndpoint"]
//                                 customUserTraits:config[@"customUserTraits"]
//                              revenueCatAppUserId:config[@"revenueCatAppUserId"]
//                     fallbackPaywallPerTriggerTags:config[@"fallbackPaywallPerTrigger"]];
}

- (void)presentUpsell:(NSString *)trigger {
//  NSLog(@"Present upsell called with trigger: %@", trigger);
    [[HeliumBridge shared] presentUpsellWithTrigger:trigger];
}

// You'll need to implement event handling for TurboModules
- (void)sendEventToJS:(NSString *)eventName body:(NSDictionary *)body {
    // TurboModules handle events differently
    // You might need to use callbacks or implement a different pattern
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeHeliumBridgeSpecJSI>(params);
}

@end
