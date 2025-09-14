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
    
    func onPaywallEvent(_ event: any PaywallEvent) {
        var eventDict = event.toDictionary()
        // Add deprecated fields for backwards compatibility
        if let paywallName = eventDict["paywallName"] {
            eventDict["paywallTemplateName"] = paywallName
        }
        if let error = eventDict["error"] {
            eventDict["errorDescription"] = error
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
        guard let apiKey = config["apiKey"] as? String,
              let viewTag = config["fallbackPaywall"] as? NSNumber else {
            return
        }

        let triggers = config["triggers"] as? [String]
        let customUserId = config["customUserId"] as? String
        let customAPIEndpoint = config["customAPIEndpoint"] as? String
        let customUserTraits = config["customUserTraits"] as? [String: Any]
        let revenueCatAppUserId = config["revenueCatAppUserId"] as? String
        let fallbackPaywallPerTriggerTags = config["fallbackPaywallPerTrigger"] as? [String: NSNumber]
        let fallbackBundleURLString = config["fallbackBundleUrlString"] as? String
        let fallbackBundleString = config["fallbackBundleString"] as? String

        let paywallLoadingConfig = config["paywallLoadingConfig"] as? [String: Any]
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

        self.bridgingDelegate = BridgingPaywallDelegate(
            bridge: self
        )

        // Always do view lookup on main queue
        DispatchQueue.main.async {
            let startTime = CFAbsoluteTimeGetCurrent()
            
            guard let bridge = self.bridge,
                  let fallbackPaywall = bridge.uiManager.view(forReactTag: viewTag) else {
                return
            }
            
            
            let wrappedView = UIViewWrapper(view: fallbackPaywall)
            
            // Process fallbackPaywallPerTrigger if provided
            var triggerViewsMap: [String: any View]? = nil
            
            if let fallbackPaywallPerTriggerTags = fallbackPaywallPerTriggerTags {
                triggerViewsMap = [:]
                
                for (trigger, tag) in fallbackPaywallPerTriggerTags {
                    if let view = bridge.uiManager.view(forReactTag: tag) {
                        // Initially hide trigger-specific fallback views
                        triggerViewsMap?[trigger] = UIViewWrapper(view: view)
                    } else {
                    }
                }
            }

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

            let mainThreadTime = CFAbsoluteTimeGetCurrent() - startTime

            // Move initialization off main queue
            DispatchQueue.global().async {
                let initStartTime = CFAbsoluteTimeGetCurrent()
                
                Helium.shared.initialize(
                    apiKey: apiKey,
                    heliumPaywallDelegate: self.bridgingDelegate!,
                    fallbackConfig: HeliumFallbackConfig.withMultipleFallbacks(
                        fallbackView: wrappedView,
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
                
                let initTime = CFAbsoluteTimeGetCurrent() - initStartTime
            }
        }
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
            }
        ),
        customPaywallTraits: customPaywallTraits
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
    HeliumPaywallDelegateWrapper.shared.onFallbackOpenCloseEvent(trigger: trigger, isOpen: isOpen, viewType: viewType)
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
  public func canPresentUpsell(
      _ trigger: String,
      callback: @escaping RCTResponseSenderBlock
  ) {
    // Check if paywalls are downloaded successfully
    let paywallsLoaded = Helium.shared.paywallsLoaded()

    // Check if trigger exists in fetched triggers
    let triggerNames = HeliumFetchedConfigManager.shared.getFetchedTriggerNames()
    let hasTrigger = triggerNames.contains(trigger)

    let canPresent: Bool
    let reason: String

    let useLoading = Helium.shared.loadingStateEnabledFor(trigger: trigger)
    let downloadInProgress = Helium.shared.getDownloadStatus() == .inProgress

    if paywallsLoaded && hasTrigger {
      // Normal case - paywall is ready
      canPresent = true
      reason = "ready"
    } else if downloadInProgress && useLoading {
      // Loading case - paywall still downloading
      canPresent = true
      reason = "loading"
    } else if HeliumFallbackViewManager.shared.getFallbackInfo(trigger: trigger) != nil {
      // Fallback is available (via downloaded bundle)
      canPresent = true
      reason = "fallback_ready"
    } else {
      // No paywall and no fallback bundle
      canPresent = false
      reason = !paywallsLoaded ? "download status - \(Helium.shared.getDownloadStatus().rawValue)" : "trigger_not_found"
    }

    callback([canPresent, reason])
  }

}
