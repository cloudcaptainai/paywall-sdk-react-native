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

enum PurchaseError: LocalizedError {
    case unknownStatus(status: String)
    case purchaseFailed(errorMsg: String)

    var errorDescription: String? {
        switch self {
        case let .unknownStatus(status):
            return "Purchase not successful due to unknown status - \(status)."
        case let .purchaseFailed(errorMsg):
            return errorMsg
        }
    }
}

private class PurchaseStateManager {
    static let shared = PurchaseStateManager()

    var currentBridge: HeliumBridge?

    // Guards the active purchase/restore continuations against cross-thread races between
    // the RN bridge methodQueue (handlePurchaseResult) and the Swift-concurrency executor
    // (makePurchase). Without it, both sides can double-resume and CheckedContinuation traps.
    private let continuationLock = NSLock()
    private var _activePurchaseContinuation: CheckedContinuation<HeliumPaywallTransactionStatus, Never>?
    private var _activeRestoreContinuation: CheckedContinuation<Bool, Never>?

    private var _latestTransactionResult: HeliumTransactionIdResult?
    private let transactionResultLock = NSLock()
    var latestTransactionResult: HeliumTransactionIdResult? {
        get {
            transactionResultLock.lock()
            defer { transactionResultLock.unlock() }
            return _latestTransactionResult
        }
        set {
            transactionResultLock.lock()
            defer { transactionResultLock.unlock() }
            _latestTransactionResult = newValue
        }
    }

    var logListenerToken: HeliumLogListenerToken?

    private init() {}

    func setPurchaseContinuation(_ continuation: CheckedContinuation<HeliumPaywallTransactionStatus, Never>) {
        continuationLock.lock()
        let orphan = _activePurchaseContinuation
        _activePurchaseContinuation = continuation
        continuationLock.unlock()
        orphan?.resume(returning: .cancelled)
    }

    func takePurchaseContinuation() -> CheckedContinuation<HeliumPaywallTransactionStatus, Never>? {
        continuationLock.lock()
        defer { continuationLock.unlock() }
        let continuation = _activePurchaseContinuation
        _activePurchaseContinuation = nil
        return continuation
    }

    func setRestoreContinuation(_ continuation: CheckedContinuation<Bool, Never>) {
        continuationLock.lock()
        let orphan = _activeRestoreContinuation
        _activeRestoreContinuation = continuation
        continuationLock.unlock()
        orphan?.resume(returning: false)
    }

    func takeRestoreContinuation() -> CheckedContinuation<Bool, Never>? {
        continuationLock.lock()
        defer { continuationLock.unlock() }
        let continuation = _activeRestoreContinuation
        _activeRestoreContinuation = nil
        return continuation
    }

    // MARK: - Event Queuing

    private let maxQueuedEvents = 30
    private let eventExpirationSeconds: TimeInterval = 10.0

    private struct PendingEvent {
        let eventName: String
        let eventData: [String: Any]
        let timestamp: Date
    }
    private var pendingEvents: [PendingEvent] = []
    private let eventLock = NSLock()

    private func queueEvent(eventName: String, eventData: [String: Any]) {
        eventLock.lock()
        defer { eventLock.unlock() }

        if pendingEvents.count >= maxQueuedEvents {
            pendingEvents.removeFirst()
        }
        pendingEvents.append(PendingEvent(eventName: eventName, eventData: eventData, timestamp: Date()))
    }

    func clearPendingEvents() {
        eventLock.lock()
        pendingEvents.removeAll()
        eventLock.unlock()
    }

    func flushEvents(bridge: HeliumBridge) {
        eventLock.lock()
        guard !pendingEvents.isEmpty else {
            eventLock.unlock()
            return
        }
        let eventsToSend = pendingEvents
        pendingEvents.removeAll()
        eventLock.unlock()

        let now = Date()
        for event in eventsToSend {
            if now.timeIntervalSince(event.timestamp) > eventExpirationSeconds {
                continue // Drop stale events
            }
            let success = ObjCExceptionCatcher.execute {
                bridge.sendEvent(withName: event.eventName, body: event.eventData)
            }
            if !success {
                // Re-queue failed events
                eventLock.lock()
                if pendingEvents.count < maxQueuedEvents {
                    pendingEvents.append(event)
                }
                eventLock.unlock()
            }
        }
    }

    func safeSendEvent(eventName: String, eventData: [String: Any]) {
        guard let bridge = currentBridge else {
            queueEvent(eventName: eventName, eventData: eventData)
            return
        }

        let success = ObjCExceptionCatcher.execute {
            bridge.sendEvent(withName: eventName, body: eventData)
        }

        if !success {
            queueEvent(eventName: eventName, eventData: eventData)
        }
    }
}

@objc(HeliumBridge)
class HeliumBridge: RCTEventEmitter {

    @objc(init)
    public override init() {
        super.init()
    }

    public override func supportedEvents() -> [String] {
        return [
            "onHeliumPaywallEvent",
            "onDelegateActionEvent",
            "paywallEventHandlers",
            "onHeliumLogEvent",
            "onEntitledEvent",
        ]
    }

    @objc
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }

    @objc
    public func initialize(_ config: NSDictionary) {
        guard let apiKey = config["apiKey"] as? String, !apiKey.isEmpty else {
            print("[Helium] initialize called with missing/empty apiKey; aborting.")
            return
        }

        PurchaseStateManager.shared.currentBridge = self
        PurchaseStateManager.shared.flushEvents(bridge: self)

        let customUserId = config["customUserId"] as? String
        let customAPIEndpoint = config["customAPIEndpoint"] as? String
        let userTraitsMap = convertMarkersToBooleans(config["customUserTraits"] as? [String: Any])
        let revenueCatAppUserId = config["revenueCatAppUserId"] as? String
        let fallbackBundleURLString = config["fallbackBundleUrlString"] as? String
        let fallbackBundleString = config["fallbackBundleString"] as? String

        let paywallLoadingConfig = convertMarkersToBooleans(config["paywallLoadingConfig"] as? [String: Any])
        let useLoadingState = paywallLoadingConfig?["useLoadingState"] as? Bool ?? true
        let loadingBudget = paywallLoadingConfig?["loadingBudget"] as? TimeInterval
        if !useLoadingState {
            Helium.config.defaultLoadingBudget = -1
        } else {
            Helium.config.defaultLoadingBudget = loadingBudget ?? 7.0
        }

        let useDefaultDelegate = config["useDefaultDelegate"] as? Bool ?? false
        let delegateType = config["delegateType"] as? String

        let delegateEventHandler: (HeliumEvent) -> Void = { event in
            var eventDict = event.toDictionary()
            // Deprecated aliases for backwards compatibility
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
            applyEventFieldAliases(&eventDict)
            PurchaseStateManager.shared.safeSendEvent(eventName: "onHeliumPaywallEvent", eventData: eventDict)
        }

        let internalDelegate = InternalDelegate(
            delegateType: delegateType,
            eventHandler: delegateEventHandler
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

        let wrapperSdkVersion = config["wrapperSdkVersion"] as? String ?? "unknown"
        HeliumSdkConfig.shared.setWrapperSdkInfo(sdk: "old-expo", version: wrapperSdkVersion)

        if let customUserId {
            Helium.identify.userId = customUserId
        }
        if let userTraitsMap {
            Helium.identify.setUserTraits(HeliumUserTraits(userTraitsMap))
        }
        if let revenueCatAppUserId {
            Helium.identify.revenueCatAppUserId = revenueCatAppUserId
        }

        Helium.config.purchaseDelegate = useDefaultDelegate ? defaultDelegate : internalDelegate
        if let fallbackBundleURL {
            Helium.config.customFallbacksURL = fallbackBundleURL
        }
        if let customAPIEndpoint {
            Helium.config.customAPIEndpoint = customAPIEndpoint
        }
        if config["androidConsumableProductIds"] != nil {
            print("[Helium] androidConsumableProductIds is only used on Android and will be ignored on iOS.")
        }

        if PurchaseStateManager.shared.logListenerToken == nil {
            PurchaseStateManager.shared.logListenerToken = HeliumLogger.addLogListener { event in
                // Drop log events if no bridge is available — don't queue them.
                // Logs can be high-volume and could evict critical purchase/restore events.
                guard PurchaseStateManager.shared.currentBridge != nil else { return }

                let eventData: [String: Any] = [
                    "level": event.level.rawValue,
                    "category": event.category.rawValue,
                    "message": event.message,
                    "metadata": event.metadata,
                ]
                PurchaseStateManager.shared.safeSendEvent(eventName: "onHeliumLogEvent", eventData: eventData)
            }
        }

        Helium.shared.initialize(apiKey: apiKey)
    }

    @objc
    public func handlePurchaseResult(
        _ statusString: NSString,
        error: NSString?,
        transactionId: NSString?,
        originalTransactionId: NSString?,
        productId: NSString?
    ) {
        guard let continuation = PurchaseStateManager.shared.takePurchaseContinuation() else {
            print("[Helium] handlePurchaseResult called with no active continuation")
            return
        }

        let lowercasedStatus = (statusString as String).lowercased()
        let status: HeliumPaywallTransactionStatus

        switch lowercasedStatus {
        case "purchased":
            status = .purchased
            if let productId = productId as String?, let transactionId = transactionId as String? {
                PurchaseStateManager.shared.latestTransactionResult = HeliumTransactionIdResult(
                    productId: productId,
                    transactionId: transactionId,
                    originalTransactionId: originalTransactionId as String?
                )
            }
        case "cancelled":
            status = .cancelled
        case "restored":
            status = .restored
        case "pending":
            status = .pending
        case "failed":
            status = .failed(PurchaseError.purchaseFailed(errorMsg: (error as String?) ?? "Unexpected error."))
        default:
            status = .failed(PurchaseError.unknownStatus(status: lowercasedStatus))
        }

        continuation.resume(returning: status)
    }

    @objc
    public func handleRestoreResult(_ success: Bool) {
        guard let continuation = PurchaseStateManager.shared.takeRestoreContinuation() else {
            print("[Helium] handleRestoreResult called with no active continuation")
            return
        }
        continuation.resume(returning: success)
    }

    @objc
    public func presentUpsell(
        _ trigger: String,
        customPaywallTraits: [String: Any]?,
        dontShowIfAlreadyEntitled: Bool,
        androidDisableSystemBackNavigation: Bool
    ) {
        PurchaseStateManager.shared.currentBridge = self
        PurchaseStateManager.shared.flushEvents(bridge: self)

        var paywallTraits: HeliumUserTraits? = nil
        if let paywallTraitsMap = convertMarkersToBooleans(customPaywallTraits) {
            paywallTraits = HeliumUserTraits(paywallTraitsMap)
        }

        Helium.shared.presentPaywall(
            trigger: trigger,
            config: PaywallPresentationConfig(
                customPaywallTraits: paywallTraits,
                dontShowIfAlreadyEntitled: dontShowIfAlreadyEntitled
            ),
            eventHandlers: PaywallEventHandlers.withHandlers(
                onAnyEvent: { event in
                    var eventDict = event.toDictionary()
                    applyEventFieldAliases(&eventDict)
                    PurchaseStateManager.shared.safeSendEvent(eventName: "paywallEventHandlers", eventData: eventDict)
                }
            ),
            onEntitled: {
                PurchaseStateManager.shared.safeSendEvent(eventName: "onEntitledEvent", eventData: [:])
            }
        ) { _ in
            // paywallNotShownReason — nothing for now
        }
    }

    @objc
    public func hideUpsell() {
        _ = Helium.shared.hidePaywall()
    }

    @objc
    public func hideAllUpsells() {
        Helium.shared.hideAllPaywalls()
    }

    @objc
    public func getDownloadStatus(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        resolver(Helium.shared.getDownloadStatus().rawValue)
    }

    @objc
    public func fallbackOpenOrCloseEvent(
        _ trigger: String?,
        isOpen: Bool,
        viewType: String?
    ) {
        // No-op stub kept for API compatibility — method is no longer exposed by the native SDK.
    }

    @objc
    public func getPaywallInfo(
        _ trigger: String,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard let paywallInfo = Helium.shared.getPaywallInfo(trigger: trigger) else {
            resolver(["errorMsg": "Invalid trigger or paywalls not ready."])
            return
        }
        resolver([
            "templateName": paywallInfo.paywallTemplateName,
            "shouldShow": paywallInfo.shouldShow,
        ])
    }

    @objc
    public func handleDeepLink(
        _ urlString: String,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard let url = URL(string: urlString) else {
            resolver(false)
            return
        }
        resolver(Helium.shared.handleDeepLink(url))
    }

    @objc
    public func setRevenueCatAppUserId(_ rcAppUserId: String) {
        Helium.identify.revenueCatAppUserId = rcAppUserId
    }

    @objc
    public func setCustomUserId(_ newUserId: String) {
        Helium.identify.userId = newUserId
    }

    @objc
    public func setThirdPartyAnalyticsAnonymousId(_ anonymousId: NSString?) {
        Helium.identify.thirdPartyAnalyticsAnonymousId = anonymousId as String?
    }

    @objc
    public func hasEntitlementForPaywall(
        _ trigger: String,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        Task {
            let hasEntitlement = await Helium.entitlements.hasEntitlementForPaywall(trigger: trigger)
            resolver(["hasEntitlement": hasEntitlement as Any])
        }
    }

    @objc
    public func hasAnyActiveSubscription(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        Task {
            let result = await Helium.entitlements.hasAnyActiveSubscription()
            resolver(result)
        }
    }

    @objc
    public func hasAnyEntitlement(
        _ resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        Task {
            let result = await Helium.entitlements.hasAny()
            resolver(result)
        }
    }

    @objc
    public func getExperimentInfoForTrigger(
        _ trigger: String,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        guard let experimentInfo = Helium.experiments.infoForTrigger(trigger) else {
            resolver(["getExperimentInfoErrorMsg": "No experiment info found for trigger: \(trigger)"])
            return
        }

        let encoder = JSONEncoder()
        guard let jsonData = try? encoder.encode(experimentInfo),
              let dictionary = try? JSONSerialization.jsonObject(with: jsonData, options: []) as? [String: Any] else {
            resolver(["getExperimentInfoErrorMsg": "Failed to serialize experiment info"])
            return
        }

        resolver(dictionary)
    }

    @objc
    public func disableRestoreFailedDialog() {
        Helium.config.restorePurchasesDialog.disableRestoreFailedDialog()
    }

    @objc
    public func setCustomRestoreFailedStrings(
        _ customTitle: String?,
        customMessage: String?,
        customCloseButtonText: String?
    ) {
        Helium.config.restorePurchasesDialog.setCustomRestoreFailedStrings(
            customTitle: customTitle,
            customMessage: customMessage,
            customCloseButtonText: customCloseButtonText
        )
    }

    @objc
    public func resetHelium(
        _ clearUserTraits: Bool,
        clearHeliumEventListeners: Bool,
        clearExperimentAllocations: Bool,
        resolver: @escaping RCTPromiseResolveBlock,
        rejecter: @escaping RCTPromiseRejectBlock
    ) {
        PurchaseStateManager.shared.logListenerToken?.remove()
        PurchaseStateManager.shared.logListenerToken = nil
        PurchaseStateManager.shared.clearPendingEvents()

        Helium.resetHelium(
            clearUserTraits: clearUserTraits,
            clearHeliumEventListeners: clearHeliumEventListeners,
            clearExperimentAllocations: clearExperimentAllocations,
            onComplete: {
                resolver(nil)
            }
        )
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
        Helium.config.lightDarkModeOverride = heliumMode
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

private class InternalDelegate: HeliumPaywallDelegate, HeliumDelegateReturnsTransaction {
    private let _delegateType: String?
    public var delegateType: String { _delegateType ?? "custom" }

    private let eventHandler: (HeliumEvent) -> Void

    init(
        delegateType: String?,
        eventHandler: @escaping (HeliumEvent) -> Void
    ) {
        self._delegateType = delegateType
        self.eventHandler = eventHandler
    }

    // MARK: - HeliumPaywallDelegate

    public func makePurchase(productId: String) async -> HeliumPaywallTransactionStatus {
        PurchaseStateManager.shared.latestTransactionResult = nil

        return await withCheckedContinuation { continuation in
            PurchaseStateManager.shared.setPurchaseContinuation(continuation)

            PurchaseStateManager.shared.safeSendEvent(
                eventName: "onDelegateActionEvent",
                eventData: [
                    "type": "purchase",
                    "productId": productId,
                ]
            )
        }
    }

    public func restorePurchases() async -> Bool {
        return await withCheckedContinuation { continuation in
            PurchaseStateManager.shared.setRestoreContinuation(continuation)

            PurchaseStateManager.shared.safeSendEvent(
                eventName: "onDelegateActionEvent",
                eventData: [
                    "type": "restore",
                ]
            )
        }
    }

    func onPaywallEvent(_ event: any HeliumEvent) {
        eventHandler(event)
    }

    // MARK: - HeliumDelegateReturnsTransaction

    func getLatestCompletedTransactionIdResult() -> HeliumTransactionIdResult? {
        return PurchaseStateManager.shared.latestTransactionResult
    }
}

fileprivate class DefaultPurchaseDelegate: StoreKitDelegate {
    private let eventHandler: (HeliumEvent) -> Void
    init(eventHandler: @escaping (HeliumEvent) -> Void) {
        self.eventHandler = eventHandler
    }

    override func onPaywallEvent(_ event: any HeliumEvent) {
        eventHandler(event)
    }
}

/// Modifies native event dictionary fields to match expected TypeScript types.
/// Free function to avoid capturing `self` in long-lived closures.
private func applyEventFieldAliases(_ eventDict: inout [String: Any]) {
    if eventDict["customPaywallActionName"] == nil, let actionName = eventDict["actionName"] {
        eventDict["customPaywallActionName"] = actionName
    }
    if eventDict["customPaywallActionParams"] == nil, let params = eventDict["params"] {
        eventDict["customPaywallActionParams"] = params
    }
}
