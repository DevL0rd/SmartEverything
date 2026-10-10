package expo.modules.healthconnect.watch

import expo.modules.healthconnect.jsonOf
import org.json.JSONArray
import org.json.JSONObject

sealed class SettingValue {
  class Flag(val on: Boolean) : SettingValue()
  class Pick(val value: String) : SettingValue()
  class Clock(val hour: Int, val minute: Int) : SettingValue() {
    val text: String get() = "%02d:%02d".format(hour, minute)
  }
}

class SettingInfo(
  val key: String,
  val section: String,
  val label: String,
  val description: String?,
  val value: SettingValue,
  val options: List<Pair<String, String>> = emptyList()
) {
  fun toJson(): JSONObject {
    val base = jsonOf("key" to key, "section" to section, "label" to label, "description" to description)
    return when (value) {
      is SettingValue.Flag -> base.put("kind", "switch").put("value", value.on)
      is SettingValue.Clock -> base.put("kind", "time").put("value", value.text)
      is SettingValue.Pick -> base.put("kind", "choice").put("value", value.value)
        .put("options", JSONArray(options.map { (v, l) -> jsonOf("value" to v, "label" to l) }))
    }
  }
}

class AlarmInfo(
  val id: Int?,
  val hour: Int,
  val minute: Int,
  val enabled: Boolean,
  val days: List<String>,
  val smart: Boolean
) {
  fun toJson(): JSONObject = jsonOf(
    "id" to id,
    "time" to "%02d:%02d".format(hour, minute),
    "enabled" to enabled,
    "days" to JSONArray(days),
    "smart" to smart
  )

  companion object {
    val WEEKDAYS = listOf("mon", "tue", "wed", "thu", "fri", "sat", "sun")

    fun of(json: JSONObject): AlarmInfo {
      val (hour, minute) = json.getString("time").split(':').map { it.toInt() }
      val days = json.getJSONArray("days")
      return AlarmInfo(
        if (json.isNull("id")) null else json.getInt("id"),
        hour,
        minute,
        json.getBoolean("enabled"),
        (0 until days.length()).map { days.getString(it) },
        json.getBoolean("smart")
      )
    }
  }
}

class FaceInfo(val id: String, val name: String, val active: Boolean, val removable: Boolean) {
  fun toJson(): JSONObject = jsonOf("id" to id, "name" to name, "active" to active, "removable" to removable)
}

class GoalInfo(val key: String, val sent: Int?, val reported: Int?, val shown: Boolean?) {
  fun toJson(): JSONObject = jsonOf("key" to key, "sent" to sent, "reported" to reported, "shown" to shown)
}

class WatchConfigSnapshot(
  val settings: List<SettingInfo>,
  val alarms: List<AlarmInfo>,
  val faces: List<FaceInfo>,
  val goals: List<GoalInfo>,
  val sports: List<String>
) {
  fun toJson(): JSONObject = jsonOf(
    "settings" to JSONArray(settings.map { it.toJson() }),
    "alarms" to JSONArray(alarms.map { it.toJson() }),
    "faces" to JSONArray(faces.map { it.toJson() }),
    "goals" to JSONArray(goals.map { it.toJson() }),
    "sports" to JSONArray(sports)
  )
}

class ActionOutcome(val ok: Boolean, val detail: String)

sealed class WatchRequest(val label: String) {
  class SetSetting(val key: String, val raw: Any) : WatchRequest("change $key")
  class SaveAlarm(val alarm: AlarmInfo) : WatchRequest("save an alarm")
  class DeleteAlarm(val id: Int) : WatchRequest("delete alarm $id")
  class SetFace(val id: String) : WatchRequest("switch watch face")
  class DeleteFace(val id: String) : WatchRequest("remove a watch face")
  class StartWorkout(val sport: String) : WatchRequest("start a $sport workout")
  class ChangeWorkout(val change: WorkoutChange) : WatchRequest("${change.verb} the workout")
  class ProbeWorkout(val sport: Int, val on: Boolean) : WatchRequest("${if (on) "start" else "finish"} workout probe for sport $sport")
}
