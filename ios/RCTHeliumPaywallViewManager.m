#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(HeliumPaywallViewManager, RCTViewManager)

RCT_EXPORT_VIEW_PROPERTY(triggerName, NSString)
RCT_EXPORT_VIEW_PROPERTY(customPaywallTraits, NSDictionary)
RCT_EXPORT_VIEW_PROPERTY(onPaywallEvent, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onEntitledEvent, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPaywallNotShown, RCTDirectEventBlock)

@end
