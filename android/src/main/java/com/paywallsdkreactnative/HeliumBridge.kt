package com.paywallsdkreactnative

import android.util.Log
import com.android.billingclient.api.ProductDetails
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.tryhelium.paywall.core.Helium
import com.tryhelium.paywall.core.HeliumEnvironment
import com.tryhelium.paywall.core.HeliumLightDarkMode
import com.tryhelium.paywall.core.HeliumPaywallTransactionStatus
import com.tryhelium.paywall.core.HeliumUserTraits
import com.tryhelium.paywall.core.HeliumUserTraits.Companion.create
import com.tryhelium.paywall.core.HeliumWrapperSdkConfig
import com.tryhelium.paywall.core.PaywallPresentationConfig
import com.tryhelium.paywall.core.event.HeliumEvent
import com.tryhelium.paywall.core.event.HeliumEventDictionaryMapper
import com.tryhelium.paywall.core.event.PaywallEventHandlers
import com.tryhelium.paywall.core.logger.HeliumLogLevel
import com.tryhelium.paywall.core.logger.HeliumLogger
import com.tryhelium.paywall.delegate.HeliumPaywallDelegate
import com.tryhelium.paywall.delegate.PlayStorePaywallDelegate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

// Singleton to manage bridge state that survives module recreation (dev reloads, resets).
private object BridgeStateManager {
    private const val TAG = "HeliumBridge"
    private const val MAX_QUEUED_EVENTS = 30
    private const val EVENT_EXPIRATION_MS = 30_000L

    // Guards the active purchase/restore continuations against cross-thread races between
    // the RN module thread (handlePurchaseResult) and the Helium SDK coroutine dispatcher
    // (makePurchase).
    private val continuationLock = Any()
    private var _purchaseContinuation: ((HeliumPaywallTransactionStatus) -> Unit)? = null
    private var _restoreContinuation: ((Boolean) -> Unit)? = null

    // Written on the RN module thread; read from background threads (Helium log listener,
    // SDK coroutine dispatcher). @Volatile ensures cross-thread visibility of the reference.
    @Volatile
    var currentBridge: HeliumBridge? = null

    private data class PendingEvent(
        val eventName: String,
        val eventData: Map<String, Any?>,
        val timestamp: Long = System.currentTimeMillis()
    )
    private val pendingEvents = mutableListOf<PendingEvent>()

    fun setPurchaseContinuation(continuation: (HeliumPaywallTransactionStatus) -> Unit) {
        val orphan = synchronized(continuationLock) {
            val existing = _purchaseContinuation
            _purchaseContinuation = continuation
            existing
        }
        orphan?.invoke(HeliumPaywallTransactionStatus.Cancelled)
    }

    fun takePurchaseContinuation(): ((HeliumPaywallTransactionStatus) -> Unit)? = synchronized(continuationLock) {
        val c = _purchaseContinuation
        _purchaseContinuation = null
        c
    }

    // Cancellation handler clears only its own continuation — a later setPurchaseContinuation
    // could already have replaced the stored value, and we must not wipe that newer one.
    fun clearPurchaseContinuationIf(expected: (HeliumPaywallTransactionStatus) -> Unit) {
        synchronized(continuationLock) {
            if (_purchaseContinuation === expected) {
                _purchaseContinuation = null
            }
        }
    }

    fun setRestoreContinuation(continuation: (Boolean) -> Unit) {
        val orphan = synchronized(continuationLock) {
            val existing = _restoreContinuation
            _restoreContinuation = continuation
            existing
        }
        orphan?.invoke(false)
    }

    fun takeRestoreContinuation(): ((Boolean) -> Unit)? = synchronized(continuationLock) {
        val c = _restoreContinuation
        _restoreContinuation = null
        c
    }

    fun clearRestoreContinuationIf(expected: (Boolean) -> Unit) {
        synchronized(continuationLock) {
            if (_restoreContinuation === expected) {
                _restoreContinuation = null
            }
        }
    }

    private fun queueEvent(eventName: String, eventData: Map<String, Any?>) {
        synchronized(pendingEvents) {
            if (pendingEvents.size >= MAX_QUEUED_EVENTS) {
                pendingEvents.removeAt(0)
                Log.w(TAG, "Event queue full, dropping oldest event")
            }
            pendingEvents.add(PendingEvent(eventName, eventData))
        }
    }

    fun clearPendingEvents() {
        synchronized(pendingEvents) {
            pendingEvents.clear()
        }
    }

    fun flushEvents(bridge: HeliumBridge) {
        val eventsToSend: List<PendingEvent>
        synchronized(pendingEvents) {
            if (pendingEvents.isEmpty()) return
            eventsToSend = pendingEvents.toList()
            pendingEvents.clear()
        }

        val now = System.currentTimeMillis()
        eventsToSend.forEach { event ->
            if (now - event.timestamp > EVENT_EXPIRATION_MS) {
                Log.w(TAG, "Dropping stale event: ${event.eventName}")
                return@forEach
            }
            if (!bridge.sendEvent(event.eventName, event.eventData)) {
                Log.w(TAG, "Failed to flush event ${event.eventName}, dropping")
            }
        }
    }

    fun safeSendEvent(eventName: String, eventData: Map<String, Any?>) {
        val bridge = currentBridge
        if (bridge == null) {
            queueEvent(eventName, eventData)
            return
        }

        if (!bridge.sendEvent(eventName, eventData)) {
            queueEvent(eventName, eventData)
        }
    }
}

class HeliumBridge(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "HeliumBridge"
        private const val TAG = "HeliumBridge"
        private const val DEFAULT_LOADING_BUDGET_MS = 7000L

        const val EVENT_PAYWALL_EVENT = "onHeliumPaywallEvent"
        const val EVENT_DELEGATE_ACTION = "onDelegateActionEvent"
        const val EVENT_PAYWALL_HANDLERS = "paywallEventHandlers"
        const val EVENT_HELIUM_LOG = "onHeliumLogEvent"
        const val EVENT_ENTITLED = "onEntitledEvent"

        private const val TRUE_MARKER = "__helium_rn_bool_true__"
        private const val FALSE_MARKER = "__helium_rn_bool_false__"
    }

    private val gson = Gson()

    override fun getName(): String = NAME

    // -------------------------------------------------------------------------
    // Event Emitter Support
    // -------------------------------------------------------------------------

    private var listenerCount = 0

    /**
     * Emit an event to JS. Returns true on success, false if emission failed
     * (e.g. catalyst instance torn down) so callers can queue for retry.
     */
    internal fun sendEvent(eventName: String, eventData: Map<String, Any?>): Boolean {
        return try {
            val params = mapToWritableMap(eventData)
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(eventName, params)
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to emit $eventName: ${e.message}")
            false
        }
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
    fun initialize(config: ReadableMap) {
        val apiKey = config.getString("apiKey")
        if (apiKey.isNullOrEmpty()) {
            Log.e(TAG, "initialize called with missing/empty apiKey; aborting.")
            return
        }

        BridgeStateManager.currentBridge = this
        BridgeStateManager.flushEvents(this)
        val customUserId = if (config.hasKey("customUserId")) config.getString("customUserId") else null
        val customAPIEndpoint = if (config.hasKey("customAPIEndpoint")) config.getString("customAPIEndpoint") else null
        val revenueCatAppUserId = if (config.hasKey("revenueCatAppUserId")) config.getString("revenueCatAppUserId") else null
        val useDefaultDelegate = if (config.hasKey("useDefaultDelegate")) config.getBoolean("useDefaultDelegate") else false
        val delegateType = if (config.hasKey("delegateType")) config.getString("delegateType") ?: "custom" else "custom"

        val customUserTraitsMap = if (config.hasKey("customUserTraits")) {
            convertMarkersToBooleans(config.getMap("customUserTraits"))
        } else null
        val customUserTraits = convertToHeliumUserTraits(customUserTraitsMap)

        val fallbackBundleUrlString = if (config.hasKey("fallbackBundleUrlString")) config.getString("fallbackBundleUrlString") else null
        val fallbackBundleString = if (config.hasKey("fallbackBundleString")) config.getString("fallbackBundleString") else null

        val paywallLoadingConfigMap = if (config.hasKey("paywallLoadingConfig")) {
            convertMarkersToBooleans(config.getMap("paywallLoadingConfig"))
        } else null
        val useLoadingState = paywallLoadingConfigMap?.get("useLoadingState") as? Boolean ?: true
        val loadingBudgetMs = (paywallLoadingConfigMap?.get("loadingBudget") as? Number)
            ?.let { (it.toDouble() * 1000).toLong() }
            ?: DEFAULT_LOADING_BUDGET_MS
        if (!useLoadingState) {
            Helium.config.defaultLoadingBudgetInMs = -1
        } else {
            Helium.config.defaultLoadingBudgetInMs = loadingBudgetMs
        }

        val environmentString = if (config.hasKey("environment")) config.getString("environment") else null
        val environment = when (environmentString?.lowercase()) {
            "sandbox" -> HeliumEnvironment.SANDBOX
            "production" -> HeliumEnvironment.PRODUCTION
            else -> HeliumEnvironment.PRODUCTION
        }

        // Event handler for delegate-dispatched events (adds deprecated aliases).
        val delegateEventHandler: (HeliumEvent) -> Unit = { event ->
            val eventMap = HeliumEventDictionaryMapper.toDictionary(event).toMutableMap()
            eventMap["paywallName"]?.let { eventMap["paywallTemplateName"] = it }
            eventMap["error"]?.let { eventMap["errorDescription"] = it }
            eventMap["productId"]?.let { eventMap["productKey"] = it }
            eventMap["buttonName"]?.let { eventMap["ctaName"] = it }
            applyEventFieldAliases(eventMap)
            BridgeStateManager.safeSendEvent(EVENT_PAYWALL_EVENT, eventMap)
        }

        val wrapperSdkVersion = if (config.hasKey("wrapperSdkVersion")) config.getString("wrapperSdkVersion") ?: "unknown" else "unknown"
        HeliumWrapperSdkConfig.setWrapperSdkInfo(sdk = "old-expo", version = wrapperSdkVersion)

        // Bridging logger: forward native SDK logs to JS.
        Helium.config.logger = BridgingLogger()

        try {
            val delegate: HeliumPaywallDelegate = if (useDefaultDelegate) {
                val activity = reactContext.currentActivity
                if (activity != null) {
                    DefaultPaywallDelegate(activity, delegateEventHandler)
                } else {
                    Log.e(TAG, "No activity available for default delegate, using bridging delegate")
                    CustomPaywallDelegate(delegateType, delegateEventHandler)
                }
            } else {
                CustomPaywallDelegate(delegateType, delegateEventHandler)
            }

            customUserId?.let { Helium.identity.userId = it }
            customUserTraits?.let { Helium.identity.setUserTraits(it) }
            revenueCatAppUserId?.let { Helium.identity.revenueCatAppUserId = it }

            Helium.config.heliumPaywallDelegate = delegate
            customAPIEndpoint?.let { Helium.config.customApiEndpoint = it }

            val consumableIds = if (config.hasKey("androidConsumableProductIds")) {
                val arr = config.getArray("androidConsumableProductIds")
                val set = mutableSetOf<String>()
                if (arr != null) {
                    for (i in 0 until arr.size()) {
                        if (arr.getType(i) == ReadableType.String) {
                            val raw = arr.getString(i)?.trim()
                            if (!raw.isNullOrEmpty()) set.add(raw)
                        }
                    }
                }
                set.takeIf { it.isNotEmpty() }
            } else null
            consumableIds?.let { Helium.config.consumableIds = it }

            // Forward fallback JSON to native SDK.
            val fallbackJsonString: String? = when {
                fallbackBundleUrlString != null -> {
                    try {
                        val sourceFile = java.io.File(java.net.URI.create(fallbackBundleUrlString))
                        if (sourceFile.exists()) sourceFile.readText() else null
                    } catch (e: Exception) {
                        Helium.config.logger?.e("Failed to read fallbacks: ${e.message}")
                        null
                    }
                }
                fallbackBundleString != null -> fallbackBundleString
                else -> null
            }
            fallbackJsonString?.let { HeliumWrapperSdkConfig.setFallbacksJson(it) }

            Helium.initialize(
                context = reactContext,
                apiKey = apiKey,
                environment = environment,
            )
        } catch (e: Exception) {
            Helium.config.logger?.e("Failed to initialize: ${e.message}")
        }
    }

    // -------------------------------------------------------------------------
    // Paywall Presentation
    // -------------------------------------------------------------------------

    @ReactMethod
    fun presentUpsell(
        trigger: String,
        customPaywallTraits: ReadableMap?,
        dontShowIfAlreadyEntitled: Boolean,
        disableSystemBackNavigation: Boolean
    ) {
        BridgeStateManager.currentBridge = this
        BridgeStateManager.flushEvents(this)

        val convertedTraits = convertToHeliumUserTraits(convertMarkersToBooleans(customPaywallTraits))

        val eventHandlers = PaywallEventHandlers(
            onAnyEvent = { event ->
                val eventMap = HeliumEventDictionaryMapper.toDictionary(event).toMutableMap()
                applyEventFieldAliases(eventMap)
                BridgeStateManager.safeSendEvent(EVENT_PAYWALL_HANDLERS, eventMap)
            },
        )

        Helium.presentPaywall(
            trigger = trigger,
            config = PaywallPresentationConfig(
                fromActivityContext = reactContext.currentActivity,
                customPaywallTraits = convertedTraits,
                dontShowIfAlreadyEntitled = dontShowIfAlreadyEntitled,
                disableSystemBackNavigation = disableSystemBackNavigation
            ),
            onEntitled = {
                BridgeStateManager.safeSendEvent(EVENT_ENTITLED, emptyMap())
            },
            eventListener = eventHandlers,
            onPaywallNotShown = { _ ->
                // nothing for now
            }
        )
    }

    @ReactMethod
    fun hideUpsell() {
        Helium.hidePaywall()
    }

    @ReactMethod
    fun hideAllUpsells() {
        Helium.hideAllPaywalls()
    }

    // -------------------------------------------------------------------------
    // Purchase Handling
    // -------------------------------------------------------------------------

    @ReactMethod
    fun handlePurchaseResult(
        statusString: String,
        errorMsg: String?,
        transactionId: String?,
        originalTransactionId: String?,
        productId: String?
    ) {
        val continuation = BridgeStateManager.takePurchaseContinuation()
        if (continuation == null) {
            Log.w(TAG, "handlePurchaseResult called with no active continuation")
            return
        }

        val status: HeliumPaywallTransactionStatus = when (statusString.lowercase()) {
            "purchased" -> HeliumPaywallTransactionStatus.Purchased
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

        continuation(status)
    }

    @ReactMethod
    fun handleRestoreResult(success: Boolean) {
        val continuation = BridgeStateManager.takeRestoreContinuation()
        if (continuation == null) {
            Log.w(TAG, "handleRestoreResult called with no active continuation")
            return
        }
        continuation(success)
    }

    // -------------------------------------------------------------------------
    // Fallback Handling
    // -------------------------------------------------------------------------

    @ReactMethod
    fun fallbackOpenOrCloseEvent(trigger: String?, isOpen: Boolean, viewType: String?) {
        // No-op stub kept for API compatibility.
    }

    // -------------------------------------------------------------------------
    // Paywall Info
    // -------------------------------------------------------------------------

    @ReactMethod
    fun getPaywallInfo(trigger: String, promise: Promise) {
        try {
            val paywallInfo = Helium.shared.getPaywallInfo(trigger)
            if (paywallInfo == null) {
                promise.resolve(mapToWritableMap(mapOf("errorMsg" to "Invalid trigger or paywalls not ready.")))
            } else {
                promise.resolve(mapToWritableMap(mapOf(
                    "templateName" to paywallInfo.paywallTemplateName,
                    "shouldShow" to paywallInfo.shouldShow
                )))
            }
        } catch (e: Exception) {
            promise.reject("ERR_GET_PAYWALL_INFO", e.message, e)
        }
    }

    // -------------------------------------------------------------------------
    // Deep Links
    // -------------------------------------------------------------------------

    @ReactMethod
    fun handleDeepLink(urlString: String, promise: Promise) {
        try {
            val handled = Helium.shared.handleDeepLink(uri = urlString)
            promise.resolve(handled)
        } catch (e: Exception) {
            promise.reject("ERR_HANDLE_DEEP_LINK", e.message, e)
        }
    }

    // -------------------------------------------------------------------------
    // User Identity
    // -------------------------------------------------------------------------

    @ReactMethod
    fun setRevenueCatAppUserId(rcAppUserId: String) {
        Helium.identity.revenueCatAppUserId = rcAppUserId
    }

    @ReactMethod
    fun setCustomUserId(newUserId: String) {
        Helium.identity.userId = newUserId
    }

    @ReactMethod
    fun setThirdPartyAnalyticsAnonymousId(anonymousId: String?) {
        Helium.identity.thirdPartyAnalyticsAnonymousId = anonymousId
    }

    // -------------------------------------------------------------------------
    // Entitlements
    // -------------------------------------------------------------------------

    @ReactMethod
    fun hasEntitlementForPaywall(trigger: String, promise: Promise) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                val result = Helium.entitlements.hasEntitlementForPaywall(trigger)
                promise.resolve(mapToWritableMap(mapOf("hasEntitlement" to result)))
            } catch (e: Exception) {
                promise.reject("ERR_HAS_ENTITLEMENT_FOR_PAYWALL", e.message, e)
            }
        }
    }

    @ReactMethod
    fun hasAnyActiveSubscription(promise: Promise) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                promise.resolve(Helium.entitlements.hasAnyActiveSubscription())
            } catch (e: Exception) {
                promise.reject("ERR_HAS_ANY_ACTIVE_SUBSCRIPTION", e.message, e)
            }
        }
    }

    @ReactMethod
    fun hasAnyEntitlement(promise: Promise) {
        CoroutineScope(Dispatchers.Main).launch {
            try {
                promise.resolve(Helium.entitlements.hasAnyEntitlement())
            } catch (e: Exception) {
                promise.reject("ERR_HAS_ANY_ENTITLEMENT", e.message, e)
            }
        }
    }

    // -------------------------------------------------------------------------
    // Experiments
    // -------------------------------------------------------------------------

    @ReactMethod
    fun getExperimentInfoForTrigger(trigger: String, promise: Promise) {
        try {
            val experimentInfo = Helium.experiments.getExperimentInfoForTrigger(trigger)
            if (experimentInfo == null) {
                promise.resolve(mapToWritableMap(mapOf(
                    "getExperimentInfoErrorMsg" to "No experiment info found for trigger: $trigger"
                )))
                return
            }
            val json = gson.toJson(experimentInfo)
            val type = object : TypeToken<Map<String, Any?>>() {}.type
            val map: Map<String, Any?> = gson.fromJson(json, type)
            promise.resolve(mapToWritableMap(map))
        } catch (e: Exception) {
            Log.e(TAG, "Failed to serialize experiment info: ${e.message}", e)
            promise.resolve(mapToWritableMap(mapOf(
                "getExperimentInfoErrorMsg" to "Failed to serialize experiment info"
            )))
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
    fun resetHelium(
        clearUserTraits: Boolean,
        clearHeliumEventListeners: Boolean,
        clearExperimentAllocations: Boolean,
        promise: Promise
    ) {
        // Restore stdout logger so next initialize() can install a fresh BridgingLogger.
        Helium.config.logger = HeliumLogger.Stdout
        BridgeStateManager.clearPendingEvents()
        try {
            Helium.resetHelium(
                clearUserTraits = clearUserTraits,
                clearHeliumEventListeners = clearHeliumEventListeners,
                clearExperimentAllocations = clearExperimentAllocations,
                onComplete = {
                    promise.resolve(null)
                }
            )
        } catch (e: Exception) {
            promise.reject("ERR_RESET_HELIUM", e.message, e)
        }
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
        Helium.config.lightDarkModeOverride = heliumMode
    }

    // -------------------------------------------------------------------------
    // Download Status
    // -------------------------------------------------------------------------

    @ReactMethod
    fun getDownloadStatus(promise: Promise) {
        try {
            val status = (Helium.shared.downloadStatus as? kotlinx.coroutines.flow.StateFlow<*>)?.value
            val statusString = when (status?.javaClass?.simpleName) {
                "NotYetDownloaded" -> "notDownloadedYet"
                "Downloading" -> "inProgress"
                "DownloadFailure" -> "downloadFailure"
                "DownloadSuccess" -> "downloadSuccess"
                else -> "notDownloadedYet"
            }
            promise.resolve(statusString)
        } catch (e: Exception) {
            promise.reject("ERR_GET_DOWNLOAD_STATUS", e.message, e)
        }
    }

    // -------------------------------------------------------------------------
    // Helper Functions
    // -------------------------------------------------------------------------

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
            ReadableType.Map -> convertMarkersToBooleans(map.getMap(key))
            ReadableType.Array -> convertArrayMarkersToBooleans(map.getArray(key))
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
                ReadableType.Map -> convertMarkersToBooleans(array.getMap(index))
                ReadableType.Array -> convertArrayMarkersToBooleans(array.getArray(index))
                ReadableType.Boolean -> array.getBoolean(index)
                ReadableType.Number -> array.getDouble(index)
                ReadableType.Null -> null
            }
        }
    }

    private fun convertToHeliumUserTraits(input: Map<String, Any?>?): HeliumUserTraits? {
        if (input == null) return null
        @Suppress("UNCHECKED_CAST")
        val nonNull = input.filterValues { it != null } as Map<String, Any>
        if (nonNull.isEmpty()) return null
        return nonNull.create()
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
                is List<*> -> writableMap.putArray(key, listToWritableArray(value))
                else -> writableMap.putString(key, value.toString())
            }
        }
        return writableMap
    }

    /**
     * Convert a List to WritableArray for React Native bridge
     */
    private fun listToWritableArray(list: List<*>): WritableArray {
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
                is List<*> -> writableArray.pushArray(listToWritableArray(item))
                else -> writableArray.pushString(item.toString())
            }
        }
        return writableArray
    }
}

/**
 * Custom Helium Paywall Delegate that bridges purchase calls to React Native.
 * Used when useDefaultDelegate is false.
 *
 * Note: we don't store a bridge reference here — the Helium SDK keeps this
 * delegate alive indefinitely, so any captured bridge would never be GC'd.
 */
private class CustomPaywallDelegate(
    override val delegateType: String,
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
            val resumeCallback: (HeliumPaywallTransactionStatus) -> Unit = { status ->
                continuation.resume(status)
            }
            BridgeStateManager.setPurchaseContinuation(resumeCallback)

            continuation.invokeOnCancellation {
                BridgeStateManager.clearPurchaseContinuationIf(resumeCallback)
            }

            val eventMap = mutableMapOf<String, Any?>(
                "type" to "purchase",
                "productId" to productDetails.productId
            )
            basePlanId?.let { eventMap["basePlanId"] = it }
            offerId?.let { eventMap["offerId"] = it }

            BridgeStateManager.safeSendEvent(HeliumBridge.EVENT_DELEGATE_ACTION, eventMap)
        }
    }

    override suspend fun restorePurchases(): Boolean {
        return suspendCancellableCoroutine { continuation ->
            val resumeCallback: (Boolean) -> Unit = { success ->
                continuation.resume(success)
            }
            BridgeStateManager.setRestoreContinuation(resumeCallback)

            continuation.invokeOnCancellation {
                BridgeStateManager.clearRestoreContinuationIf(resumeCallback)
            }

            BridgeStateManager.safeSendEvent(
                HeliumBridge.EVENT_DELEGATE_ACTION,
                mapOf("type" to "restore")
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

/**
 * Bridging logger that forwards native SDK logs to JS while also logging to
 * logcat via the stdout logger.
 *
 * Log level mapping to match iOS:
 * - e (error) -> 1, w (warn) -> 2, i (info) -> 3, d (debug) -> 4, v (verbose) -> 5
 */
private class BridgingLogger : HeliumLogger {
    override val logTag: String = "Helium"
    override var logLevel: HeliumLogLevel = HeliumLogLevel.ERROR

    private val stdoutLogger = HeliumLogger.Stdout

    override fun e(message: String) {
        stdoutLogger.e(message)
        sendLogEvent(level = 1, message = message)
    }

    override fun w(message: String) {
        stdoutLogger.w(message)
        sendLogEvent(level = 2, message = message)
    }

    override fun i(message: String) {
        stdoutLogger.i(message)
        sendLogEvent(level = 3, message = message)
    }

    override fun d(message: String) {
        stdoutLogger.d(message)
        sendLogEvent(level = 4, message = message)
    }

    override fun v(message: String) {
        stdoutLogger.v(message)
        sendLogEvent(level = 5, message = message)
    }

    private fun sendLogEvent(level: Int, message: String) {
        // Drop log events if no bridge is available — don't queue them.
        // Logs are high-volume and could evict critical purchase/restore events.
        // They're already going to logcat via stdoutLogger.
        if (BridgeStateManager.currentBridge == null) return

        val eventData = mapOf(
            "level" to level,
            "category" to logTag,
            "message" to "[$logTag] $message",
            "metadata" to emptyMap<String, String>()
        )
        BridgeStateManager.safeSendEvent(HeliumBridge.EVENT_HELIUM_LOG, eventData)
    }
}

/**
 * Rewrite native event dict fields to match expected TypeScript types.
 * Top-level so it doesn't capture references in long-lived closures.
 */
private fun applyEventFieldAliases(eventMap: MutableMap<String, Any?>) {
    if (eventMap["customPaywallActionName"] == null) {
        eventMap["actionName"]?.let { eventMap["customPaywallActionName"] = it }
    }
    if (eventMap["customPaywallActionParams"] == null) {
        eventMap["params"]?.let { eventMap["customPaywallActionParams"] = it }
    }
}
