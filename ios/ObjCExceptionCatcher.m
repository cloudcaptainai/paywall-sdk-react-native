#import "ObjCExceptionCatcher.h"

@implementation ObjCExceptionCatcher

+ (BOOL)execute:(void(NS_NOESCAPE ^)(void))block {
    @try {
        block();
        return YES;
    }
    @catch (NSException *exception) {
        NSLog(@"[HeliumPaywallSdk] Caught NSException: %@ - %@", exception.name, exception.reason);
        return NO;
    }
}

@end
