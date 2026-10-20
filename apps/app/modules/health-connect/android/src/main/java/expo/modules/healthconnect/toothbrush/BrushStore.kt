package expo.modules.healthconnect.toothbrush

import android.content.Context
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.diagnostics.NativeLog
import kotlinx.serialization.SerializationException

class BrushStore(context: Context, private val requestPlans: () -> Unit = { askHubForPlans(context) }) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun save(plans: List<LinkPlan>) {
    preferences.edit().putString(PLANS, HubJson.encode(plans)).putBoolean(RESYNC, false).apply()
  }

  fun resyncPending(): Boolean = preferences.getBoolean(RESYNC, false)

  fun plans(): List<LinkPlan> {
    val stored = preferences.getString(PLANS, null) ?: return emptyList()
    return try {
      HubJson.decode(stored)
    } catch (failure: SerializationException) {
      discard(failure)
      emptyList()
    }
  }

  private fun discard(failure: SerializationException) {
    NativeLog.warn(SCOPE, "plans.unreadable", failure) { mapOf("reason" to "saved toothbrush plans could not be read, asking the hub for new ones") }
    preferences.edit().remove(PLANS).putBoolean(RESYNC, true).apply()
    requestPlans()
  }

  fun byAddress(address: String): LinkPlan? = plans().firstOrNull { it.address.equals(address, ignoreCase = true) }

  fun byDevice(deviceId: String): LinkPlan? = plans().firstOrNull { it.deviceId == deviceId }

  fun holding(): List<LinkPlan> = plans().filter { it.holder }

  fun clear() {
    preferences.edit().clear().apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.sonicare"
    const val PLANS = "plans"
    const val RESYNC = "resync"
    const val SCOPE = "toothbrush"

    fun askHubForPlans(context: Context) {
      try {
        BrushService.send(context, BrushService.ACTION_REFRESH)
      } catch (failure: ServiceStartRefused) {
        NativeLog.warn(SCOPE, "plans.resync_refused", failure) { mapOf("reason" to "the connection service could not start, the plans will be requested on the next refresh") }
      }
    }
  }
}
