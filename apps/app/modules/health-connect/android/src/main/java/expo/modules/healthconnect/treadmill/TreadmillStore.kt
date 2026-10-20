package expo.modules.healthconnect.treadmill

import android.content.Context
import expo.modules.healthconnect.HubJson

class TreadmillStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun save(plans: List<LinkPlan>) {
    preferences.edit().putString(PLANS, HubJson.encode(plans)).apply()
  }

  fun plans(): List<LinkPlan> {
    val stored = preferences.getString(PLANS, null) ?: return emptyList()
    return HubJson.decode(stored)
  }

  fun byAddress(address: String): LinkPlan? = plans().firstOrNull { it.address.equals(address, ignoreCase = true) }

  fun byDevice(deviceId: String): LinkPlan? = plans().firstOrNull { it.deviceId == deviceId }

  fun holding(): List<LinkPlan> = plans().filter { it.holder }

  fun clear() {
    preferences.edit().clear().apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.treadmills"
    const val PLANS = "plans"
  }
}
