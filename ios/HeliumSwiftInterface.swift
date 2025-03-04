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
                  let status: HeliumPaywallTransactionStatus = switch response.status {
                      case "purchased": .purchased
                      case "cancelled": .cancelled
                      case "restored": .restored
                      case "pending": .pending
                      default: .failed(NSError())
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
        
        // Remove callback before executing to prevent multiple calls
        purchaseState.pendingResponses.removeValue(forKey: transactionId)
        
        callback(PurchaseState.PurchaseResponse(
            transactionId: transactionId,
            status: status
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
          status: status
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
           "helium_download_state_changed"
       ]
   }
   
   @objc
   override static func requiresMainQueueSetup() -> Bool {
       return true
   }
   
  @objc
  public func initialize(
      _ config: NSDictionary,
      customVariableValues:NSDictionary
  ) {
      guard let apiKey = config["apiKey"] as? String,
            let viewTag = config["fallbackPaywall"] as? NSNumber else {
          return
      }
      
      let triggers = config["triggers"] as? [String]
      let customUserId = config["customUserId"] as? String
      let customAPIEndpoint = config["customAPIEndpoint"] as? String
      let customUserTraits = config["customUserTraits"] as? [String: AnyCodable];
      
      self.bridgingDelegate = BridgingPaywallDelegate(
          bridge: self
      )
    
      HeliumFetchedConfigManager.shared.$downloadStatus
                .sink { newValue in
                    var newValueString = "";
                    switch (newValue) {
                      case .downloadFailure:
                      newValueString = "downloadFailure";
                      break;
                      case .downloadSuccess:
                      newValueString = "downloadSuccess";
                      break;
                      case .inProgress:
                      newValueString = "inProgress";
                      break;
                      case .notDownloadedYet:
                      newValueString = "notDownloadedYet";
                      break;
                    }
                    self.sendEvent(
                        withName: "helium_download_state_changed",
                        body: [
                          "status": newValueString
                        ]
                    )
                }
                .store(in: &cancellables)
    
      // Always do view lookup on main queue
      DispatchQueue.main.async {
          guard let bridge = self.bridge,
                let fallbackPaywall = bridge.uiManager.view(forReactTag: viewTag) else {
              return
          }
          
          let wrappedView = UIViewWrapper(view: fallbackPaywall)
          
          // Move initialization off main queue
          DispatchQueue.global().async {
              Helium.shared.initialize(
                  apiKey: apiKey,
                  heliumPaywallDelegate: self.bridgingDelegate!,
                  fallbackPaywall: wrappedView,
                  triggers: triggers,
                  customUserId: customUserId,
                  customAPIEndpoint: customAPIEndpoint,
                  customUserTraits: HeliumUserTraits(customUserTraits ?? [:])
              )
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
      _ trigger: String
  ) {
    Helium.shared.presentUpsell(trigger: trigger);
  }
  
  @objc
  public func hideUpsell() {
    _ = Helium.shared.hideUpsell();
  }
}
