package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.jsonOf
import org.json.JSONObject

object WatchUserStore {
  private const val PREFERENCES = "expo.modules.healthconnect.watch-user"

  fun save(context: Context, user: WatchUser) {
    val json = jsonOf(
      "heightCm" to user.heightCm,
      "weightKg" to user.weightKg,
      "birthDate" to user.birthDate,
      "female" to user.female,
      "maxHeartRate" to user.maxHeartRate,
      "stepGoal" to user.stepGoal,
      "calorieGoal" to user.calorieGoal,
      "activeMinutes" to user.activeMinutes
    )
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString("user", json.toString()).apply()
  }

  fun read(context: Context): WatchUser? {
    val text = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("user", null) ?: return null
    return userOf(JSONObject(text))
  }

  fun userOf(json: JSONObject): WatchUser {
    return WatchUser(
      json.getInt("heightCm"),
      json.getDouble("weightKg"),
      json.getString("birthDate"),
      json.getBoolean("female"),
      json.getInt("maxHeartRate"),
      json.getInt("stepGoal"),
      json.getInt("calorieGoal"),
      json.optInt("activeMinutes", 0)
    )
  }
}
