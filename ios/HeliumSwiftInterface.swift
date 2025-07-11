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
import AnyCodable
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
    
    func onHeliumPaywallEvent(event: HeliumPaywallEvent) {
          let eventDict = event.toDictionary()
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
           "helium_fallback_visibility"
       ]
   }
   
   @objc
   override static func requiresMainQueueSetup() -> Bool {
       return true
   }

    // MARK: - Turbo Module Implementation
    func initialize(
        config: [String: Any],
        customVariableValues: [String: Any]
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
            
            let mainThreadTime = CFAbsoluteTimeGetCurrent() - startTime
            
            // Move initialization off main queue
            DispatchQueue.global().async {
                let initStartTime = CFAbsoluteTimeGetCurrent()
                
                Helium.shared.initialize(
                    apiKey: apiKey,
                    heliumPaywallDelegate: self.bridgingDelegate!,
                    fallbackPaywall: wrappedView,
                    triggers: triggers,
                    customUserId: customUserId,
                    customAPIEndpoint: customAPIEndpoint,
                    customUserTraits: HeliumUserTraits(customUserTraits ?? [:]),
                    revenueCatAppUserId: revenueCatAppUserId,
                    fallbackPaywallPerTrigger: triggerViewsMap
                )

                let initTime = CFAbsoluteTimeGetCurrent() - initStartTime
            }
        }
    }

  func handlePurchaseResponse(response: [String: Any]) {
      bridgingDelegate?.handlePurchaseResponse(response as NSDictionary)
  }

  func handleRestoreResponse(response: [String: Any]) {
      bridgingDelegate?.handleRestoreResponse(response as NSDictionary)
  }

  func getFetchedTriggerNames(callback: @escaping ([String]) -> Void) {
    let triggerNames = HeliumFetchedConfigManager.shared.getFetchedTriggerNames();
    callback(triggerNames)
  }

   func upsellViewForTrigger(
       _ trigger: String,
       resolver: @escaping RCTPromiseResolveBlock,
       rejecter: @escaping RCTPromiseRejectBlock
   ) {
       let swiftUIView = Helium.shared.upsellViewForTrigger(trigger: trigger)
       let hostingController = UIHostingController(rootView: swiftUIView)
       resolver(hostingController.view)
   }

  func presentUpsell(trigger: String) {
    Helium.shared.presentUpsell(trigger: trigger);
  }

  func hideUpsell() {
    _ = Helium.shared.hideUpsell();
  }

  func hideAllUpsells() {
    Helium.shared.hideAllUpsells();
  }

  func fallbackOpenOrCloseEvent(
    trigger: String?,
    isOpen: Bool,
    viewType: String?
  ) {
    HeliumPaywallDelegateWrapper.shared.onFallbackOpenCloseEvent(trigger: trigger, isOpen: isOpen, viewType: viewType)
  }

  func addListener(eventType: String) {
    // Event emitter handles this automatically
  }

  func removeListeners(count: Double) {
    // Event emitter handles this automatically
  }

}
