package com.paywallsdkreactnative

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class HeliumBridge(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "HeliumBridge"

        // Event names matching iOS implementation
        const val EVENT_PAYWALL_EVENT = "helium_paywall_event"
        const val EVENT_MAKE_PURCHASE = "helium_make_purchase"
        const val EVENT_RESTORE_PURCHASES = "helium_restore_purchases"
        const val EVENT_DOWNLOAD_STATE_CHANGED = "helium_download_state_changed"
        const val EVENT_PAYWALL_HANDLERS = "paywallEventHandlers"
    }

    override fun getName(): String = NAME

    // -------------------------------------------------------------------------
    // Event Emitter Support
    // -------------------------------------------------------------------------

    private var listenerCount = 0

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventType: String) {
        listenerCount++
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        listenerCount -= count.toInt()
        if (listenerCount < 0) {
            listenerCount = 0
        }
    }

    // -------------------------------------------------------------------------
    // Initialization
    // -------------------------------------------------------------------------

    @ReactMethod
    fun initialize(config: ReadableMap, customVariableValues: ReadableMap) {
        // TODO: Initialize Helium SDK
        // Extract from config:
        // - apiKey: String (required)
        // - customUserId: String?
        // - customAPIEndpoint: String?
        // - customUserTraits: ReadableMap? (convert boolean markers)
        // - revenueCatAppUserId: String?
        // - fallbackBundleUrlString: String?
        // - fallbackBundleString: String?
        // - paywallLoadingConfig: ReadableMap? (convert boolean markers)
        // - useDefaultDelegate: Boolean
    }

    // -------------------------------------------------------------------------
    // Paywall Presentation
    // -------------------------------------------------------------------------

    @ReactMethod
    fun presentUpsell(
        trigger: String,
        customPaywallTraits: ReadableMap?,
        dontShowIfAlreadyEntitled: Boolean
    ) {
        // TODO: Present paywall for the given trigger
        // - Convert customPaywallTraits boolean markers to actual booleans
        // - Call native Helium SDK presentUpsell
        // - Set up event handlers to emit paywallEventHandlers events
    }

    @ReactMethod
    fun hideUpsell() {
        // TODO: Hide the currently displayed paywall
    }

    @ReactMethod
    fun hideAllUpsells() {
        // TODO: Hide all displayed paywalls
    }

    // -------------------------------------------------------------------------
    // Purchase Handling
    // -------------------------------------------------------------------------

    @ReactMethod
    fun handlePurchaseResponse(response: ReadableMap) {
        // TODO: Handle purchase response from JS
        // Extract:
        // - transactionId: String
        // - status: String ("completed", "purchased", "cancelled", "restored", "failed", "pending")
        // - error: String?
        // Resume the pending purchase continuation with the result
    }

    @ReactMethod
    fun handleRestoreResponse(response: ReadableMap) {
        // TODO: Handle restore response from JS
        // Extract:
        // - transactionId: String
        // - status: String ("restored" or "failed")
        // Resume the pending restore continuation with the result
    }

    // -------------------------------------------------------------------------
    // Fallback Handling
    // -------------------------------------------------------------------------

    @ReactMethod
    fun fallbackOpenOrCloseEvent(trigger: String?, isOpen: Boolean, viewType: String?) {
        // TODO: Track fallback open/close events for analytics
    }

    // -------------------------------------------------------------------------
    // Paywall Info
    // -------------------------------------------------------------------------

    @ReactMethod
    fun getFetchedTriggerNames(callback: Callback) {
        // TODO: Return array of fetched trigger names
        // callback([triggerNames])
    }

    @ReactMethod
    fun getPaywallInfo(trigger: String, callback: Callback) {
        // TODO: Get paywall info for trigger
        // On success: callback(null, paywallTemplateName, shouldShow)
        // On error: callback(errorMessage, null, null)
    }

    // -------------------------------------------------------------------------
    // Deep Links
    // -------------------------------------------------------------------------

    @ReactMethod
    fun handleDeepLink(urlString: String, callback: Callback) {
        // TODO: Handle deep link URL
        // callback(handled: Boolean)
    }

    // -------------------------------------------------------------------------
    // User Identity
    // -------------------------------------------------------------------------

    @ReactMethod
    fun setRevenueCatAppUserId(rcAppUserId: String) {
        // TODO: Set RevenueCat app user ID
    }

    @ReactMethod
    fun setCustomUserId(newUserId: String) {
        // TODO: Set custom user ID (override)
    }

    // -------------------------------------------------------------------------
    // Entitlements
    // -------------------------------------------------------------------------

    @ReactMethod
    fun hasEntitlementForPaywall(trigger: String, promise: Promise) {
        // TODO: Check if user has entitlement for paywall's products
        // promise.resolve(Boolean?) - true/false if known, null if not known
    }

    @ReactMethod
    fun hasAnyActiveSubscription(promise: Promise) {
        // TODO: Check if user has any active subscription
        // promise.resolve(Boolean)
    }

    @ReactMethod
    fun hasAnyEntitlement(promise: Promise) {
        // TODO: Check if user has any entitlement
        // promise.resolve(Boolean)
    }

    // -------------------------------------------------------------------------
    // Experiments
    // -------------------------------------------------------------------------

    @ReactMethod
    fun getExperimentInfoForTrigger(trigger: String, callback: Callback) {
        // TODO: Get experiment allocation info for trigger
        // On success: callback(true, experimentInfoMap)
        // On failure: callback(false, null)
    }

    // -------------------------------------------------------------------------
    // Restore Failed Dialog Configuration
    // -------------------------------------------------------------------------

    @ReactMethod
    fun disableRestoreFailedDialog() {
        // TODO: Disable the default restore failed dialog
    }

    @ReactMethod
    fun setCustomRestoreFailedStrings(
        customTitle: String?,
        customMessage: String?,
        customCloseButtonText: String?
    ) {
        // TODO: Set custom strings for restore failed dialog
    }

    // -------------------------------------------------------------------------
    // SDK Reset
    // -------------------------------------------------------------------------

    @ReactMethod
    fun resetHelium() {
        // TODO: Reset Helium SDK state entirely
    }

    // -------------------------------------------------------------------------
    // Appearance
    // -------------------------------------------------------------------------

    @ReactMethod
    fun setLightDarkModeOverride(mode: String) {
        // TODO: Set light/dark mode override
        // mode: "light", "dark", or "system"
    }

    // -------------------------------------------------------------------------
    // Helper Functions
    // -------------------------------------------------------------------------

    private companion object BooleanMarkers {
        const val TRUE_MARKER = "__helium_rn_bool_true__"
        const val FALSE_MARKER = "__helium_rn_bool_false__"
    }

    private fun convertMarkersToBooleans(input: ReadableMap?): Map<String, Any?>? {
        if (input == null) return null

        val result = mutableMapOf<String, Any?>()
        val iterator = input.keySetIterator()

        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            result[key] = convertValueMarkersToBooleans(input, key)
        }

        return result
    }

    private fun convertValueMarkersToBooleans(map: ReadableMap, key: String): Any? {
        return when (map.getType(key)) {
            ReadableType.String -> {
                when (val stringValue = map.getString(key)) {
                    TRUE_MARKER -> true
                    FALSE_MARKER -> false
                    else -> stringValue
                }
            }
            ReadableType.Map -> {
                convertMarkersToBooleans(map.getMap(key))
            }
            ReadableType.Array -> {
                convertArrayMarkersToBooleans(map.getArray(key))
            }
            ReadableType.Boolean -> map.getBoolean(key)
            ReadableType.Number -> map.getDouble(key)
            ReadableType.Null -> null
        }
    }

    private fun convertArrayMarkersToBooleans(array: ReadableArray?): List<Any?>? {
        if (array == null) return null

        return (0 until array.size()).map { index ->
            when (array.getType(index)) {
                ReadableType.String -> {
                    when (val stringValue = array.getString(index)) {
                        TRUE_MARKER -> true
                        FALSE_MARKER -> false
                        else -> stringValue
                    }
                }
                ReadableType.Map -> {
                    convertMarkersToBooleans(array.getMap(index))
                }
                ReadableType.Array -> {
                    convertArrayMarkersToBooleans(array.getArray(index))
                }
                ReadableType.Boolean -> array.getBoolean(index)
                ReadableType.Number -> array.getDouble(index)
                ReadableType.Null -> null
            }
        }
    }
}
