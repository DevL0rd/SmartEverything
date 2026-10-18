package expo.modules.healthconnect.phone

import android.content.Context
import org.json.JSONObject

class PhoneStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun enabled(): Boolean = preferences.getBoolean(ENABLED, false)

  fun setEnabled(on: Boolean) = preferences.edit().putBoolean(ENABLED, on).apply()

  fun sensor(sensor: PhoneSensor): Boolean = preferences.getBoolean(SENSOR + sensor.wire, false)

  fun setSensor(sensor: PhoneSensor, on: Boolean) = preferences.edit().putBoolean(SENSOR + sensor.wire, on).apply()

  fun sent(): JSONObject = JSONObject(preferences.getString(SENT, null) ?: "{}")

  fun setSent(values: JSONObject) = preferences.edit().putString(SENT, values.toString()).apply()

  fun sentParts(): JSONObject = JSONObject(preferences.getString(SENT_PARTS, null) ?: "{}")

  fun setSentParts(parts: JSONObject) = preferences.edit().putString(SENT_PARTS, parts.toString()).apply()

  fun forgetSent() = preferences.edit().remove(SENT).remove(SENT_PARTS).apply()

  fun unlocksOn(day: String): Int = if (preferences.getString(UNLOCK_DAY, null) == day) preferences.getInt(UNLOCK_COUNT, 0) else 0

  fun countUnlock(day: String) =
    preferences.edit().putString(UNLOCK_DAY, day).putInt(UNLOCK_COUNT, unlocksOn(day) + 1).apply()

  fun context(): PhoneContextSnapshot =
    preferences.getString(CONTEXT, null)?.let { PhoneContextSnapshot.fromJson(JSONObject(it)) } ?: PhoneContextSnapshot.INITIAL

  fun setContext(snapshot: PhoneContextSnapshot) =
    preferences.edit().putString(CONTEXT, snapshot.toJson().toString()).apply()

  fun car(): String? = preferences.getString(CAR, null)

  fun setCar(address: String?) = preferences.edit().putString(CAR, address).apply()

  fun homeWifi(): String? = preferences.getString(HOME_WIFI, null)

  fun setHomeWifi(ssid: String?) = preferences.edit().putString(HOME_WIFI, ssid).apply()

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.phone"
    const val ENABLED = "enabled"
    const val SENSOR = "sensor."
    const val SENT = "sent"
    const val SENT_PARTS = "sentParts"
    const val UNLOCK_DAY = "unlockDay"
    const val UNLOCK_COUNT = "unlockCount"
    const val CONTEXT = "context"
    const val CAR = "car"
    const val HOME_WIFI = "homeWifi"
  }
}

enum class PhoneSensor(val wire: String) {
  ACTIVITY("activity"),
  PLACES("places"),
  CAR("car"),
  NAVIGATION("navigation"),
  SCREEN_TIME("screen_time"),
  APP_USAGE("app_usage"),
  NOTIFICATION_TITLES("notification_titles");

  companion object {
    fun of(wire: String): PhoneSensor =
      entries.firstOrNull { it.wire == wire }
        ?: throw IllegalArgumentException("unknown phone sensor \"$wire\"; expected one of ${entries.map { it.wire }}")
  }
}
