package com.paywallsdkreactnative

import com.tryhelium.paywall.core.Helium

internal object MissingPaywallReason {
    fun forTrigger(trigger: String): String? = Helium.getMissingPaywallReason(trigger)
}
