//
//  HeliumUpsellViewManager.m
//  HeliumBridgeNative
//
//  Created by Anish Doshi on 2/11/25.
//

#import <Foundation/Foundation.h>
#import <React/RCTViewManager.h>

@interface RCT_EXTERN_MODULE(HeliumUpsellViewManager, RCTViewManager)
RCT_EXPORT_VIEW_PROPERTY(trigger, NSString)
+ (BOOL)requiresMainQueueSetup
{
    return YES;
}
@end
