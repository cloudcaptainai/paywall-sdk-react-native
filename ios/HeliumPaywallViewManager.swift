import Foundation
import React

@objc(HeliumPaywallViewManager)
class HeliumPaywallViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool {
    return true
  }

  override func view() -> UIView! {
    return HeliumPaywallView()
  }
}
