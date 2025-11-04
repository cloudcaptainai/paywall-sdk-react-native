//
//  HeliumSwiftInterface.swift
//  HeliumBridgeNative
//
//  Created by Anish Doshi on 2/11/25.
//

import Foundation
import Helium
import SwiftUI
import UIKit
import React
import Combine

struct UIViewWrapper: UIViewRepresentable, View {
    let view: UIView
    
    func makeUIView(context: Context) -> UIView {
        return view
    }
    
    func updateUIView(_ uiView: UIView, context: Context) {
    }
}

class PurchaseState: ObservableObject {
    struct PurchaseResponse {
        let transactionId: String
        let status: String
        let error: String?
    }
    
    @Published var pendingResponses: [String: (PurchaseResponse) -> Void] = [:]
}


class BridgingPaywallDelegate: HeliumPaywallDelegate {
    private let purchaseState = PurchaseState()
    private weak var bridge: HeliumBridge?
    
    init(
          bridge: HeliumBridge
      ) {
          self.bridge = bridge
      }
  
    public func makePurchase(productId: String) async -> HeliumPaywallTransactionStatus {
          return await withCheckedContinuation { continuation in
              let transactionId = UUID().uuidString
              // Store continuation callback
              purchaseState.pendingResponses[transactionId] = { response in
                let userInfo: [String: Any] = [
                    NSLocalizedDescriptionKey: response.error ?? "Failed to make purchase",
                    NSLocalizedFailureReasonErrorKey: "An unknown error occurred",
                    NSLocalizedRecoverySuggestionErrorKey: "Please try again later"
                ]
                let failureError = NSError(domain: "PaywallErrorDomain", code: 1001, userInfo: userInfo)

                  let status: HeliumPaywallTransactionStatus = switch response.status {
                      case "completed": .purchased
                      case "purchased": .purchased
                      case "cancelled": .cancelled
                      case "restored": .restored
                      case "failed": .failed(failureError)
                      case "pending": .pending
                      default: .failed(failureError)
                  }
                  continuation.resume(returning: status)
              }
              
              // Send event to initiate purchase
              bridge?.sendEvent(
                  withName: "helium_make_purchase",
                  body: [
                      "productId": productId,
                      "transactionId": transactionId,
                      "status": "starting"
                  ]
              )
          }
      }
      
    func handlePurchaseResponse(_ response: NSDictionary) {
        guard let transactionId = response["transactionId"] as? String,
              let status = response["status"] as? String,
              let callback = purchaseState.pendingResponses[transactionId] else {
            return
        }
        
        let error = response["error"] as? String
        
        // Remove callback before executing to prevent multiple calls
        purchaseState.pendingResponses.removeValue(forKey: transactionId)
        
        callback(PurchaseState.PurchaseResponse(
            transactionId: transactionId,
            status: status,
            error: error
        ))
    }
    
  
  func restorePurchases() async -> Bool {
      return await withCheckedContinuation { continuation in
          let transactionId = UUID().uuidString
          
          // Store continuation callback
          purchaseState.pendingResponses[transactionId] = { response in
              // Convert string status to bool
              let success = response.status == "restored"
              continuation.resume(returning: success)
          }
          
          // Send event to initiate restore
          bridge?.sendEvent(
              withName: "helium_restore_purchases",
              body: [
                  "transactionId": transactionId,
                  "status": "starting"
              ]
          )
      }
  }

  func handleRestoreResponse(_ response: NSDictionary) {
      guard let transactionId = response["transactionId"] as? String,
            let status = response["status"] as? String,
            let callback = purchaseState.pendingResponses[transactionId] else {
          return
      }
      
      // Remove callback before executing to prevent multiple calls
      purchaseState.pendingResponses.removeValue(forKey: transactionId)
      
      callback(PurchaseState.PurchaseResponse(
          transactionId: transactionId,
          status: status,
          error: nil
      ))
  }

    func onPaywallEvent(_ event: any HeliumEvent) {
        var eventDict = event.toDictionary()
        // Add deprecated fields for backwards compatibility
        if let paywallName = eventDict["paywallName"] {
            eventDict["paywallTemplateName"] = paywallName
        }
        if let error = eventDict["error"] {
            eventDict["errorDescription"] = error
        }
        if let productId = eventDict["productId"] {
            eventDict["productKey"] = productId
        }
        if let buttonName = eventDict["buttonName"] {
            eventDict["ctaName"] = buttonName
        }
        bridge?.sendEvent(
            withName: "helium_paywall_event",
            body: eventDict
        )
    }
    
    func getCustomVariableValues() -> [String: Any?] {
        return [:];
    }
}

@objc(HeliumBridge)
class HeliumBridge: RCTEventEmitter {
   private var bridgingDelegate: BridgingPaywallDelegate?
   var customVariables: [String: Any?] = [:]
   private var cancellables = Set<AnyCancellable>()

  @objc(init)
  public override init() {
      super.init()
  }
  
   public override func supportedEvents() -> [String] {
       return [
           "helium_paywall_event",
           "helium_make_purchase",
           "helium_restore_purchases",
           "helium_download_state_changed",
           "helium_fallback_visibility",
           "paywallEventHandlers"
       ]
   }
   
   @objc
   override static func requiresMainQueueSetup() -> Bool {
       return true
   }
   
    @objc
    public func initialize(
        _ config: NSDictionary,
        customVariableValues: NSDictionary
    ) {
        guard let apiKey = config["apiKey"] as? String else {
            return
        }

        let customUserId = config["customUserId"] as? String
        let customAPIEndpoint = config["customAPIEndpoint"] as? String
        let customUserTraits = convertMarkersToBooleans(config["customUserTraits"] as? [String: Any])
        let revenueCatAppUserId = config["revenueCatAppUserId"] as? String
        let fallbackBundleURLString = config["fallbackBundleUrlString"] as? String
        let fallbackBundleString = config["fallbackBundleString"] as? String

        let paywallLoadingConfig = convertMarkersToBooleans(config["paywallLoadingConfig"] as? [String: Any])
        let useLoadingState = paywallLoadingConfig?["useLoadingState"] as? Bool ?? true
        let loadingBudget = paywallLoadingConfig?["loadingBudget"] as? TimeInterval ?? 2.0

        var perTriggerLoadingConfig: [String: TriggerLoadingConfig]? = nil
        if let perTriggerDict = paywallLoadingConfig?["perTriggerLoadingConfig"] as? [String: [String: Any]] {
          var triggerConfigs: [String: TriggerLoadingConfig] = [:]
          for (trigger, config) in perTriggerDict {
            triggerConfigs[trigger] = TriggerLoadingConfig(
              useLoadingState: config["useLoadingState"] as? Bool,
              loadingBudget: config["loadingBudget"] as? TimeInterval
            )
          }
          perTriggerLoadingConfig = triggerConfigs
        }

        let useDefaultDelegate = config["useDefaultDelegate"] as? Bool ?? false

        let delegateEventHandler: (HeliumEvent) -> Void = { [weak self] event in
            var eventDict = event.toDictionary()
            // Add deprecated fields for backwards compatibility
            if let paywallName = eventDict["paywallName"] {
                eventDict["paywallTemplateName"] = paywallName
            }
            if let error = eventDict["error"] {
                eventDict["errorDescription"] = error
            }
            if let productId = eventDict["productId"] {
                eventDict["productKey"] = productId
            }
            if let buttonName = eventDict["buttonName"] {
                eventDict["ctaName"] = buttonName
            }
            self?.sendEvent(
                withName: "helium_paywall_event",
                body: eventDict
            )
        }

        self.bridgingDelegate = BridgingPaywallDelegate(
            bridge: self
        )

        let defaultDelegate = DefaultPurchaseDelegate(eventHandler: delegateEventHandler)

        // Handle fallback bundle - either as URL string or JSON string
        var fallbackBundleURL: URL? = nil

        if let urlString = fallbackBundleURLString {
            fallbackBundleURL = URL(string: urlString)
        } else if let jsonString = fallbackBundleString {
            // expo-file-system wasn't available, write the string to a temp file
            let tempURL = FileManager.default.temporaryDirectory
                .appendingPathComponent("helium-fallback.json")

            if let data = jsonString.data(using: .utf8) {
                try? data.write(to: tempURL)
                fallbackBundleURL = tempURL
            }
        }

        Helium.shared.initialize(
            apiKey: apiKey,
            heliumPaywallDelegate: useDefaultDelegate ? defaultDelegate : self.bridgingDelegate!,
            fallbackConfig: HeliumFallbackConfig.withMultipleFallbacks(
                // As a workaround for required fallback check in iOS, supply empty fallbackPerTrigger
                // since currently iOS requires some type of fallback but RN does not.
                fallbackPerTrigger: [:],
                fallbackBundle: fallbackBundleURL,
                useLoadingState: useLoadingState,
                loadingBudget: loadingBudget,
                perTriggerLoadingConfig: perTriggerLoadingConfig
            ),
            customUserId: customUserId,
            customAPIEndpoint: customAPIEndpoint,
            customUserTraits: HeliumUserTraits(customUserTraits ?? [:]),
            revenueCatAppUserId: revenueCatAppUserId
        )
    }
  
  @objc
  public func handlePurchaseResponse(_ response: NSDictionary) {
      bridgingDelegate?.handlePurchaseResponse(response)
  }
  
  @objc
  public func handleRestoreResponse(_ response: NSDictionary) {
      bridgingDelegate?.handleRestoreResponse(response)
  }

  @objc
  public func getFetchedTriggerNames(_ callback: RCTResponseSenderBlock) {
    let triggerNames = HeliumFetchedConfigManager.shared.getFetchedTriggerNames();
    callback([triggerNames])
  }
    
   @objc
   public func upsellViewForTrigger(
       _ trigger: String,
       resolver: @escaping RCTPromiseResolveBlock,
       rejecter: @escaping RCTPromiseRejectBlock
   ) {
       let swiftUIView = Helium.shared.upsellViewForTrigger(trigger: trigger)
       let hostingController = UIHostingController(rootView: swiftUIView)
       resolver(hostingController.view)
   }

  @objc
  public func presentUpsell(
    _ trigger: String,
    customPaywallTraits: [String: Any]?
  ) {
    Helium.shared.presentUpsell(
        trigger: trigger,
        eventHandlers: PaywallEventHandlers.withHandlers(
            onOpen: { [weak self] event in
                self?.sendEvent(withName: "paywallEventHandlers", body: event.toDictionary())
            },
            onClose: { [weak self] event in
                self?.sendEvent(withName: "paywallEventHandlers", body: event.toDictionary())
            },
            onDismissed: { [weak self] event in
                self?.sendEvent(withName: "paywallEventHandlers", body: event.toDictionary())
            },
            onPurchaseSucceeded: { [weak self] event in
                self?.sendEvent(withName: "paywallEventHandlers", body: event.toDictionary())
            },
            onOpenFailed: { [weak self] event in
                self?.sendEvent(withName: "paywallEventHandlers", body: event.toDictionary())
            },
            onCustomPaywallAction: { [weak self] event in
                self?.sendEvent(withName: "paywallEventHandlers", body: event.toDictionary())
            }
        ),
        customPaywallTraits: convertMarkersToBooleans(customPaywallTraits)
    );
  }
    
  @objc
  public func hideUpsell() {
    _ = Helium.shared.hideUpsell();
  }

  @objc
  public func hideAllUpsells() {
    Helium.shared.hideAllUpsells();
  }

  @objc
  public func fallbackOpenOrCloseEvent(
    _ trigger: String?,
    isOpen: Bool,
    viewType: String?
  ) {
    HeliumPaywallDelegateWrapper.shared.onFallbackOpenCloseEvent(trigger: trigger, isOpen: isOpen, viewType: viewType, fallbackReason: .bridgingError)
  }

  @objc
  public func getPaywallInfo(
    _ trigger: String,
    callback: RCTResponseSenderBlock
  ) {
    guard let paywallInfo = Helium.shared.getPaywallInfo(trigger: trigger) else {
      callback(["Invalid trigger or paywalls not ready.", NSNull(), NSNull()])
      return
    }

    callback([NSNull(), paywallInfo.paywallTemplateName, paywallInfo.shouldShow])
  }

  @objc
  public func handleDeepLink(
    _ urlString: String,
    callback: RCTResponseSenderBlock
  ) {
    guard let url = URL(string: urlString) else {
      callback([false])
      return
    }

    let result = Helium.shared.handleDeepLink(url)
    callback([result])
  }

  @objc
  public func setRevenueCatAppUserId(_ rcAppUserId: String) {
      Helium.shared.setRevenueCatAppUserId(rcAppUserId)
  }

  @objc
  public func setCustomUserId(_ newUserId: String) {
      Helium.shared.overrideUserId(newUserId: newUserId)
  }

  @objc
  public func hasEntitlementForPaywall(
      _ trigger: String,
      callback: RCTResponseSenderBlock
  ) {
      Task {
          let hasEntitlement = await Helium.shared.hasEntitlementForPaywall(trigger: trigger)
          if let hasEntitlement = hasEntitlement {
              callback([NSNull(), hasEntitlement])
          } else {
              callback([NSNull(), NSNull()])
          }
      }
  }

  @objc
  public func hasAnyActiveSubscription(
      _ resolver: @escaping RCTPromiseResolveBlock,
      rejecter: @escaping RCTPromiseRejectBlock
  ) {
      Task {
          let result = await Helium.shared.hasAnyActiveSubscription()
          resolver(result)
      }
  }

  @objc
  public func hasAnyEntitlement(
      _ resolver: @escaping RCTPromiseResolveBlock,
      rejecter: @escaping RCTPromiseRejectBlock
  ) {
      Task {
          let result = await Helium.shared.hasAnyEntitlement()
          resolver(result)
      }
  }

  @objc
  public func getExperimentInfoForTrigger(
      _ trigger: String,
      callback: RCTResponseSenderBlock
  ) {
      guard let experimentInfo = Helium.shared.getExperimentInfoForTrigger(trigger) else {
          callback([false, NSNull()])
          return
      }

      // Convert ExperimentInfo to dictionary using JSONEncoder
      let encoder = JSONEncoder()
      guard let jsonData = try? encoder.encode(experimentInfo),
            let dictionary = try? JSONSerialization.jsonObject(with: jsonData, options: []) as? [String: Any] else {
          callback([false, NSNull()])
          return
      }

      // Return the dictionary directly - it contains all ExperimentInfo fields
      callback([true, dictionary])
  }

  @objc
  public func disableRestoreFailedDialog() {
      Helium.restorePurchaseConfig.disableRestoreFailedDialog()
  }

  @objc
  public func setCustomRestoreFailedStrings(
      _ customTitle: String?,
      customMessage: String?,
      customCloseButtonText: String?
  ) {
      Helium.restorePurchaseConfig.setCustomRestoreFailedStrings(
          customTitle: customTitle,
          customMessage: customMessage,
          customCloseButtonText: customCloseButtonText
      )
  }

  @objc
  public func resetHelium() {
      Helium.resetHelium()
  }

  @objc
  public func setLightDarkModeOverride(_ mode: String) {
      let heliumMode: HeliumLightDarkMode
      switch mode.lowercased() {
      case "light":
          heliumMode = .light
      case "dark":
          heliumMode = .dark
      case "system":
          heliumMode = .system
      default:
          print("[Helium] Invalid mode: \(mode), defaulting to system")
          heliumMode = .system
      }
      Helium.shared.setLightDarkModeOverride(heliumMode)
  }

  private func convertMarkersToBooleans(_ input: [String: Any]?) -> [String: Any]? {
      guard let input = input else { return nil }

      var result: [String: Any] = [:]
      for (key, value) in input {
          result[key] = convertValueMarkersToBooleans(value)
      }
      return result
  }
  private func convertValueMarkersToBooleans(_ value: Any) -> Any {
      if let stringValue = value as? String {
          switch stringValue {
          case "__helium_rn_bool_true__":
              return true
          case "__helium_rn_bool_false__":
              return false
          default:
              return stringValue
          }
      } else if let dictValue = value as? [String: Any] {
          return convertMarkersToBooleans(dictValue) ?? [:]
      } else if let arrayValue = value as? [Any] {
          return arrayValue.map { convertValueMarkersToBooleans($0) }
      }
      return value
  }

}

fileprivate class DefaultPurchaseDelegate: StoreKitDelegate {
    private let eventHandler: (HeliumEvent) -> Void
    init(
        eventHandler: @escaping (HeliumEvent) -> Void
    ) {
        self.eventHandler = eventHandler
    }

    override func onPaywallEvent(_ event: any HeliumEvent) {
        eventHandler(event)
    }
}
