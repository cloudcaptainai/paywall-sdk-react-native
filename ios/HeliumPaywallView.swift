import Foundation
import Helium
import React
import SwiftUI
import UIKit

class HeliumPaywallView: UIView {
  @objc var triggerName: NSString = ""
  @objc var customPaywallTraits: NSDictionary?
  @objc var onPaywallEvent: RCTDirectEventBlock?
  @objc var onEntitledEvent: RCTDirectEventBlock?
  @objc var onPaywallNotShown: RCTDirectEventBlock?

  private var hostingController: UIHostingController<AnyView>?

  override func layoutSubviews() {
    super.layoutSubviews()
    hostingController?.view.frame = bounds
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      hostingController?.willMove(toParent: nil)
      hostingController?.removeFromParent()
    } else {
      attachToReactViewController()
    }
  }

  override func didSetProps(_ changedProps: [String]) {
    loadPaywallIfNeeded()
  }

  private func loadPaywallIfNeeded() {
    guard hostingController == nil, triggerName.length > 0 else {
      return
    }
    let traits = convertMarkersToBooleans(customPaywallTraits as? [String: Any]).map { HeliumUserTraits($0) }
    let paywall = HeliumPaywall(
      trigger: triggerName as String,
      config: PaywallPresentationConfig(customPaywallTraits: traits),
      eventHandlers: PaywallEventHandlers.withHandlers(onAnyEvent: { [weak self] event in
        self?.send(self?.onPaywallEvent, eventPayload(event))
      }),
      onEntitled: { [weak self] entitledEvent in
        self?.send(self?.onEntitledEvent, eventPayload(entitledEvent.event))
      }
    ) { [weak self] _ in
      Color.clear.onAppear {
        self?.send(self?.onPaywallNotShown, [:])
      }
    }
    let controller = UIHostingController(rootView: AnyView(paywall))
    controller.view.backgroundColor = .clear
    controller.view.frame = bounds
    addSubview(controller.view)
    hostingController = controller
    attachToReactViewController()
  }

  private func send(_ block: RCTDirectEventBlock?, _ payload: [String: Any]) {
    guard let block else {
      return
    }
    _ = ObjCExceptionCatcher.execute {
      block(payload)
    }
  }

  private func attachToReactViewController() {
    guard let hostingController, window != nil, let parent = reactViewController(), hostingController.parent !== parent else {
      return
    }
    if parent is UINavigationController || parent is UITabBarController {
      return
    }
    parent.addChild(hostingController)
    hostingController.didMove(toParent: parent)
  }
}

private func eventPayload(_ event: any HeliumEvent) -> [String: Any] {
  var payload = event.toDictionary()
  applyEventFieldAliases(&payload)
  return payload
}
