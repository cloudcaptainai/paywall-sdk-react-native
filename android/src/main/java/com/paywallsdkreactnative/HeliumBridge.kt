package com.paywallsdkreactnative

import android.util.Log
import com.android.billingclient.api.ProductDetails
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
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.tryhelium.paywall.core.Helium
import com.tryhelium.paywall.core.HeliumEnvironment
import com.tryhelium.paywall.core.HeliumFallbackConfig
import com.tryhelium.paywall.core.HeliumIdentityManager
import com.tryhelium.paywall.core.HeliumLightDarkMode
import com.tryhelium.paywall.core.HeliumPaywallTransactionStatus
import com.tryhelium.paywall.core.HeliumUserTraits
import com.tryhelium.paywall.core.HeliumUserTraitsArgument
import com.tryhelium.paywall.core.event.HeliumEvent
import com.tryhelium.paywall.core.event.HeliumEventDictionaryMapper
import com.tryhelium.paywall.core.event.PaywallEventHandlers
import com.tryhelium.paywall.delegate.HeliumPaywallDelegate
import com.tryhelium.paywall.delegate.PlayStorePaywallDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import kotlin.coroutines.resume

// Singleton to manage purchase state that survives module recreation
private object BridgeStateManager {
    var currentBridge: HeliumBridge? = null
    var purchaseContinuation: ((HeliumPaywallTransactionStatus) -> Unit)? = null
    var restoreContinuation: ((Boolean) -> Unit)? = null

    fun clearPurchase() {
        purchaseContinuation = null
    }

    fun clearRestore() {
        restoreContinuation = null
    }
}

class HeliumBridge(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "HeliumBridge"
        private const val TAG = "HeliumBridge"
        private const val DEFAULT_LOADING_BUDGET_MS = 7000L

        // Event names matching iOS implementation
        const val EVENT_PAYWALL_EVENT = "helium_paywall_event"
        const val EVENT_MAKE_PURCHASE = "helium_make_purchase"
        const val EVENT_RESTORE_PURCHASES = "helium_restore_purchases"
        const val EVENT_DOWNLOAD_STATE_CHANGED = "helium_download_state_changed"
        const val EVENT_PAYWALL_HANDLERS = "paywallEventHandlers"
    }

    private val gson = Gson()

    override fun getName(): String = NAME

    // -------------------------------------------------------------------------
    // Event Emitter Support
    // -------------------------------------------------------------------------

    private var listenerCount = 0

    internal fun sendEvent(eventName: String, params: WritableMap?) {
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
        BridgeStateManager.currentBridge = this

        val apiKey = config.getString("apiKey") ?: return
        val customUserId = if (config.hasKey("customUserId")) config.getString("customUserId") else null
        val customAPIEndpoint = if (config.hasKey("customAPIEndpoint")) config.getString("customAPIEndpoint") else null
        val useDefaultDelegate = if (config.hasKey("useDefaultDelegate")) config.getBoolean("useDefaultDelegate") else false

        // Convert custom user traits with boolean markers
        val customUserTraitsMap = if (config.hasKey("customUserTraits")) {
            convertMarkersToBooleans(config.getMap("customUserTraits"))
        } else null
        val customUserTraits = convertToHeliumUserTraits(customUserTraitsMap)

        // Extract fallback bundle fields
        val fallbackBundleUrlString = if (config.hasKey("fallbackBundleUrlString")) config.getString("fallbackBundleUrlString") else null
        val fallbackBundleString = if (config.hasKey("fallbackBundleString")) config.getString("fallbackBundleString") else null

        // Extract paywall loading config
        val paywallLoadingConfigMap = if (config.hasKey("paywallLoadingConfig")) {
            convertMarkersToBooleans(config.getMap("paywallLoadingConfig"))
        } else null

        // Build fallback config
        val fallbackConfig = convertToHeliumFallbackConfig(
            paywallLoadingConfigMap,
            fallbackBundleUrlString,
            fallbackBundleString
        )

        // Parse environment parameter
        val environmentString = if (config.hasKey("environment")) config.getString("environment") else null
        val environment = when (environmentString?.lowercase()) {
            "sandbox" -> HeliumEnvironment.SANDBOX
            "production" -> HeliumEnvironment.PRODUCTION
            else -> HeliumEnvironment.PRODUCTION
        }

        // Event handler for converting events with backwards compatibility
        val delegateEventHandler: (HeliumEvent) -> Unit = { event ->
            val eventMap = HeliumEventDictionaryMapper.toDictionary(event).toMutableMap()
            // Add deprecated fields for backwards compatibility
            eventMap["paywallName"]?.let { eventMap["paywallTemplateName"] = it }
            eventMap["error"]?.let { eventMap["errorDescription"] = it }
            eventMap["productId"]?.let { eventMap["productKey"] = it }
            eventMap["buttonName"]?.let { eventMap["ctaName"] = it }

            val params = mapToWritableMap(eventMap)
            BridgeStateManager.currentBridge?.sendEvent(EVENT_PAYWALL_EVENT, params)
        }

        // Initialize on coroutine scope
        CoroutineScope(Dispatchers.Main).launch {
            try {
                // Create delegate based on configuration
                val delegate = if (useDefaultDelegate) {
                    val activity = currentActivity
                    if (activity != null) {
                        DefaultPaywallDelegate(activity, delegateEventHandler)
                    } else {
                        Log.e(TAG, "No activity available for default delegate, using bridging delegate")
                        BridgingPaywallDelegate(delegateEventHandler)
                    }
                } else {
                    BridgingPaywallDelegate(delegateEventHandler)
                }

                Helium.initialize(
                    context = reactContext,
                    apiKey = apiKey,
                    heliumPaywallDelegate = delegate,
                    customUserId = customUserId,
                    customApiEndpoint = customAPIEndpoint,
                    customUserTraits = customUserTraits,
                    fallbackConfig = fallbackConfig,
                    environment = environment
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize Helium: ${e.message}", e)
            }
        }
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
        BridgeStateManager.currentBridge = this // Extra redundancy to update to latest live bridge

        // Convert custom paywall traits with boolean markers
        val convertedTraits = convertToHeliumUserTraits(convertMarkersToBooleans(customPaywallTraits))

        // Create event handlers to send events to JavaScript
        val eventHandlers = PaywallEventHandlers(
            onOpen = { event -> sendPaywallEventToJS(event) },
            onClose = { event -> sendPaywallEventToJS(event) },
            onDismissed = { event -> sendPaywallEventToJS(event) },
            onPurchaseSucceeded = { event -> sendPaywallEventToJS(event) },
            onOpenFailed = { event -> sendPaywallEventToJS(event) },
            onCustomPaywallAction = { event -> sendPaywallEventToJS(event) }
        )

        Helium.presentUpsell(
            trigger = trigger,
            dontShowIfAlreadyEntitled = dontShowIfAlreadyEntitled,
            customPaywallTraits = convertedTraits,
            eventListener = eventHandlers
        )
    }

    private fun sendPaywallEventToJS(event: HeliumEvent) {
        val eventMap = HeliumEventDictionaryMapper.toDictionary(event).toMutableMap()
        val params = mapToWritableMap(eventMap)
        BridgeStateManager.currentBridge?.sendEvent(EVENT_PAYWALL_HANDLERS, params)
    }

    @ReactMethod
    fun hideUpsell() {
        Helium.hideUpsell()
    }

    @ReactMethod
    fun hideAllUpsells() {
        Helium.hideAllUpsells()
    }

    // -------------------------------------------------------------------------
    // Purchase Handling
    // -------------------------------------------------------------------------

    @ReactMethod
    fun handlePurchaseResponse(response: ReadableMap) {
        val continuation = BridgeStateManager.purchaseContinuation ?: return

        val statusString = response.getString("status") ?: "failed"
        val errorMsg = if (response.hasKey("error")) response.getString("error") else null

        // Parse status string to HeliumPaywallTransactionStatus
        val status: HeliumPaywallTransactionStatus = when (statusString.lowercase()) {
            "completed", "purchased" -> HeliumPaywallTransactionStatus.Purchased
            "cancelled" -> HeliumPaywallTransactionStatus.Cancelled
            "restored" -> HeliumPaywallTransactionStatus.Purchased  // Android SDK has no Restored, map to Purchased
            "pending" -> HeliumPaywallTransactionStatus.Pending
            "failed" -> HeliumPaywallTransactionStatus.Failed(
                Exception(errorMsg ?: "Unexpected error.")
            )
            else -> HeliumPaywallTransactionStatus.Failed(
                Exception("Unknown status: $statusString")
            )
        }

        // Clear the singleton state before resuming
        BridgeStateManager.clearPurchase()

        // Resume the continuation with the status
        continuation(status)
    }

    @ReactMethod
    fun handleRestoreResponse(response: ReadableMap) {
        val continuation = BridgeStateManager.restoreContinuation ?: return

        val statusString = response.getString("status") ?: "failed"
        val success = statusString.lowercase() == "restored"

        // Clear the singleton state before resuming
        BridgeStateManager.clearRestore()

        // Resume the continuation
        continuation(success)
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
        // Android SDK doesn't have this API - return empty array
        callback.invoke(Arguments.createArray())
    }

    @ReactMethod
    fun getPaywallInfo(trigger: String, callback: Callback) {
        val paywallInfo = Helium.shared.getPaywallInfo(trigger)

        if (paywallInfo == null) {
            callback.invoke("Invalid trigger or paywalls not ready.", null, null)
        } else {
            callback.invoke(null, paywallInfo.paywallTemplateName, paywallInfo.shouldShow)
        }
    }

    // -------------------------------------------------------------------------
    // Deep Links
    // -------------------------------------------------------------------------

    @ReactMethod
    fun handleDeepLink(urlString: String, callback: Callback) {
        val handled = Helium.shared.handleDeepLink(uri = urlString)
        callback.invoke(handled)
    }

    // -------------------------------------------------------------------------
    // User Identity
    // -------------------------------------------------------------------------

    @ReactMethod
    fun setRevenueCatAppUserId(rcAppUserId: String) {
        HeliumIdentityManager.shared.setRevenueCatAppUserId(rcAppUserId)
    }

    @ReactMethod
    fun setCustomUserId(newUserId: String) {
        HeliumIdentityManager.shared.setCustomUserId(newUserId)
    }

    // -------------------------------------------------------------------------
    // Entitlements
    // -------------------------------------------------------------------------

    @ReactMethod
    fun hasEntitlementForPaywall(trigger: String, promise: Promise) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = Helium.shared.hasEntitlementForPaywall(trigger)
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERR_HAS_ENTITLEMENT_FOR_PAYWALL", e.message, e)
            }
        }
    }

    @ReactMethod
    fun hasAnyActiveSubscription(promise: Promise) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = Helium.shared.hasAnyActiveSubscription()
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERR_HAS_ANY_ACTIVE_SUBSCRIPTION", e.message, e)
            }
        }
    }

    @ReactMethod
    fun hasAnyEntitlement(promise: Promise) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = Helium.shared.hasAnyEntitlement()
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERR_HAS_ANY_ENTITLEMENT", e.message, e)
            }
        }
    }

    // -------------------------------------------------------------------------
    // Experiments
    // -------------------------------------------------------------------------

    @ReactMethod
    fun getExperimentInfoForTrigger(trigger: String, callback: Callback) {
        val experimentInfo = Helium.shared.getExperimentInfoForTrigger(trigger)

        if (experimentInfo == null) {
            callback.invoke(false, null)
            return
        }

        try {
            // Convert ExperimentInfo to JSON and then to Map
            val json = gson.toJson(experimentInfo)
            val type = object : TypeToken<Map<String, Any?>>() {}.type
            val map: Map<String, Any?> = gson.fromJson(json, type)
            val writableMap = mapToWritableMap(map)
            callback.invoke(true, writableMap)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to serialize experiment info: ${e.message}", e)
            callback.invoke(false, null)
        }
    }

    // -------------------------------------------------------------------------
    // Restore Failed Dialog Configuration
    // -------------------------------------------------------------------------

    @ReactMethod
    fun disableRestoreFailedDialog() {
        Helium.shared.disableRestoreFailedDialog()
    }

    @ReactMethod
    fun setCustomRestoreFailedStrings(
        customTitle: String?,
        customMessage: String?,
        customCloseButtonText: String?
    ) {
        Helium.shared.setCustomRestoreFailedStrings(
            customTitle = customTitle,
            customMessage = customMessage,
            customCloseButtonText = customCloseButtonText
        )
    }

    // -------------------------------------------------------------------------
    // SDK Reset
    // -------------------------------------------------------------------------

    @ReactMethod
    fun resetHelium() {
        Helium.resetHelium()
    }

    // -------------------------------------------------------------------------
    // Appearance
    // -------------------------------------------------------------------------

    @ReactMethod
    fun setLightDarkModeOverride(mode: String) {
        val heliumMode: HeliumLightDarkMode = when (mode.lowercase()) {
            "light" -> HeliumLightDarkMode.LIGHT
            "dark" -> HeliumLightDarkMode.DARK
            "system" -> HeliumLightDarkMode.SYSTEM
            else -> {
                Log.w(TAG, "Invalid mode: $mode, defaulting to system")
                HeliumLightDarkMode.SYSTEM
            }
        }
        Helium.shared.setLightDarkModeOverride(heliumMode)
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

    /**
     * Convert a Map to HeliumUserTraits
     */
    private fun convertToHeliumUserTraits(input: Map<String, Any?>?): HeliumUserTraits? {
        if (input == null) return null
        val traits = input.mapValues { (_, value) ->
            convertToHeliumUserTraitsArgument(value)
        }.filterValues { it != null }.mapValues { it.value!! }
        return HeliumUserTraits(traits)
    }

    /**
     * Convert a value to HeliumUserTraitsArgument
     */
    private fun convertToHeliumUserTraitsArgument(value: Any?): HeliumUserTraitsArgument? {
        return when (value) {
            is String -> HeliumUserTraitsArgument.StringParam(value)
            is Int -> HeliumUserTraitsArgument.IntParam(value)
            is Long -> HeliumUserTraitsArgument.LongParam(value)
            is Double -> HeliumUserTraitsArgument.DoubleParam(value.toString())
            is Boolean -> HeliumUserTraitsArgument.BooleanParam(value)
            is List<*> -> {
                val items = value.mapNotNull { convertToHeliumUserTraitsArgument(it) }
                HeliumUserTraitsArgument.Array(items)
            }
            is Map<*, *> -> {
                @Suppress("UNCHECKED_CAST")
                val properties = (value as? Map<String, Any?>)?.mapValues { (_, v) ->
                    convertToHeliumUserTraitsArgument(v)
                }?.filterValues { it != null }?.mapValues { it.value!! } ?: emptyMap()
                HeliumUserTraitsArgument.Complex(properties)
            }
            else -> null
        }
    }

    /**
     * Convert configuration to HeliumFallbackConfig
     */
    private fun convertToHeliumFallbackConfig(
        paywallLoadingConfig: Map<String, Any?>?,
        fallbackBundleUrlString: String?,
        fallbackBundleString: String?
    ): HeliumFallbackConfig? {
        // Extract loading config settings
        val useLoadingState = paywallLoadingConfig?.get("useLoadingState") as? Boolean ?: true
        val loadingBudget = (paywallLoadingConfig?.get("loadingBudget") as? Number)?.toLong() ?: DEFAULT_LOADING_BUDGET_MS

        // Parse perTriggerLoadingConfig if present
        var perTriggerLoadingConfig: Map<String, HeliumFallbackConfig>? = null
        val perTriggerDict = paywallLoadingConfig?.get("perTriggerLoadingConfig") as? Map<*, *>
        if (perTriggerDict != null) {
            @Suppress("UNCHECKED_CAST")
            perTriggerLoadingConfig = perTriggerDict.mapNotNull { (key, value) ->
                if (key is String && value is Map<*, *>) {
                    val config = value as? Map<String, Any?>
                    val triggerUseLoadingState = config?.get("useLoadingState") as? Boolean
                    val triggerLoadingBudget = (config?.get("loadingBudget") as? Number)?.toLong()
                    key to HeliumFallbackConfig(
                        useLoadingState = triggerUseLoadingState ?: true,
                        loadingBudgetInMs = triggerLoadingBudget ?: DEFAULT_LOADING_BUDGET_MS
                    )
                } else {
                    null
                }
            }.toMap() as? Map<String, HeliumFallbackConfig>
        }

        // Handle fallback bundle - write to helium_local directory where SDK expects it
        var fallbackBundleName: String? = null
        try {
            val heliumLocalDir = reactContext.getDir("helium_local", android.content.Context.MODE_PRIVATE)
            val destinationFile = File(heliumLocalDir, "helium-fallback.json")

            if (fallbackBundleUrlString != null) {
                // Copy file from provided URL path to helium_local
                val sourceFile = File(java.net.URI.create(fallbackBundleUrlString))
                if (sourceFile.exists()) {
                    sourceFile.copyTo(destinationFile, overwrite = true)
                    fallbackBundleName = "helium-fallback.json"
                }
            } else if (fallbackBundleString != null) {
                // Write fallback bundle string to file
                destinationFile.writeText(fallbackBundleString)
                fallbackBundleName = "helium-fallback.json"
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write fallback bundle: ${e.message}", e)
        }

        return HeliumFallbackConfig(
            useLoadingState = useLoadingState,
            loadingBudgetInMs = loadingBudget,
            perTriggerLoadingConfig = perTriggerLoadingConfig,
            fallbackBundleName = fallbackBundleName
        )
    }

    /**
     * Convert a Map to WritableMap for React Native bridge
     */
    private fun mapToWritableMap(map: Map<String, Any?>): WritableMap {
        val writableMap = Arguments.createMap()
        for ((key, value) in map) {
            when (value) {
                null -> writableMap.putNull(key)
                is Boolean -> writableMap.putBoolean(key, value)
                is Int -> writableMap.putInt(key, value)
                is Double -> writableMap.putDouble(key, value)
                is Float -> writableMap.putDouble(key, value.toDouble())
                is Long -> writableMap.putDouble(key, value.toDouble())
                is String -> writableMap.putString(key, value)
                is Map<*, *> -> {
                    @Suppress("UNCHECKED_CAST")
                    writableMap.putMap(key, mapToWritableMap(value as Map<String, Any?>))
                }
                is List<*> -> {
                    writableMap.putArray(key, listToWritableArray(value))
                }
                else -> writableMap.putString(key, value.toString())
            }
        }
        return writableMap
    }

    /**
     * Convert a List to WritableArray for React Native bridge
     */
    private fun listToWritableArray(list: List<*>): com.facebook.react.bridge.WritableArray {
        val writableArray = Arguments.createArray()
        for (item in list) {
            when (item) {
                null -> writableArray.pushNull()
                is Boolean -> writableArray.pushBoolean(item)
                is Int -> writableArray.pushInt(item)
                is Double -> writableArray.pushDouble(item)
                is Float -> writableArray.pushDouble(item.toDouble())
                is Long -> writableArray.pushDouble(item.toDouble())
                is String -> writableArray.pushString(item)
                is Map<*, *> -> {
                    @Suppress("UNCHECKED_CAST")
                    writableArray.pushMap(mapToWritableMap(item as Map<String, Any?>))
                }
                is List<*> -> {
                    writableArray.pushArray(listToWritableArray(item))
                }
                else -> writableArray.pushString(item.toString())
            }
        }
        return writableArray
    }
}

/**
 * Custom Helium Paywall Delegate that bridges purchase calls to React Native.
 * Used when useDefaultDelegate is false.
 */
private class BridgingPaywallDelegate(
    private val eventHandler: (HeliumEvent) -> Unit
) : HeliumPaywallDelegate {

    override fun onHeliumEvent(event: HeliumEvent) {
        eventHandler(event)
    }

    override suspend fun makePurchase(
        productDetails: ProductDetails,
        basePlanId: String?,
        offerId: String?
    ): HeliumPaywallTransactionStatus {
        return suspendCancellableCoroutine { continuation ->
            // Clean up any existing orphaned continuation
            BridgeStateManager.purchaseContinuation?.let { existing ->
                existing(HeliumPaywallTransactionStatus.Cancelled)
                BridgeStateManager.clearPurchase()
            }

            BridgeStateManager.purchaseContinuation = { status ->
                continuation.resume(status)
            }

            // Clean up on cancellation
            continuation.invokeOnCancellation {
                BridgeStateManager.clearPurchase()
            }

            // Send event to JavaScript
            val eventParams = Arguments.createMap().apply {
                putString("productId", productDetails.productId)
                basePlanId?.let { putString("basePlanId", it) }
                offerId?.let { putString("offerId", it) }
                putString("status", "starting")
            }
            BridgeStateManager.currentBridge?.sendEvent(
                HeliumBridge.EVENT_MAKE_PURCHASE,
                eventParams
            )
        }
    }

    override suspend fun restorePurchases(): Boolean {
        return suspendCancellableCoroutine { continuation ->
            // Clean up any existing orphaned continuation
            BridgeStateManager.restoreContinuation?.let { existing ->
                existing(false)
                BridgeStateManager.clearRestore()
            }

            BridgeStateManager.restoreContinuation = { success ->
                continuation.resume(success)
            }

            // Clean up on cancellation
            continuation.invokeOnCancellation {
                BridgeStateManager.clearRestore()
            }

            // Send event to JavaScript
            val eventParams = Arguments.createMap().apply {
                putString("status", "starting")
            }
            BridgeStateManager.currentBridge?.sendEvent(
                HeliumBridge.EVENT_RESTORE_PURCHASES,
                eventParams
            )
        }
    }
}

/**
 * Default Paywall Delegate that extends PlayStorePaywallDelegate with event dispatching.
 * Used when useDefaultDelegate is true.
 */
private class DefaultPaywallDelegate(
    activity: android.app.Activity,
    private val eventHandler: (HeliumEvent) -> Unit
) : PlayStorePaywallDelegate(activity) {

    override fun onHeliumEvent(event: HeliumEvent) {
        eventHandler(event)
    }
}
