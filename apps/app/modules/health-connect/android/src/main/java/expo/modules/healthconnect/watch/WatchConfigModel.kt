package expo.modules.healthconnect.watch

import expo.modules.healthconnect.HubJson
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonPrimitive
import org.json.JSONObject

sealed class SettingValue {
  class Flag(val on: Boolean) : SettingValue()
  class Pick(val value: String) : SettingValue()
  class Clock(val hour: Int, val minute: Int) : SettingValue() {
    val text: String get() = "%02d:%02d".format(hour, minute)
  }
}

@Serializable
class OptionWire(val value: String, val label: String)

@Serializable
class SettingWire(
  val key: String,
  val section: String,
  val label: String,
  val description: String?,
  val kind: String,
  val value: JsonPrimitive,
  val options: List<OptionWire>? = null
)

class SettingInfo(
  val key: String,
  val section: String,
  val label: String,
  val description: String?,
  val value: SettingValue,
  val options: List<Pair<String, String>> = emptyList()
) {
  fun wire(): SettingWire = when (value) {
    is SettingValue.Flag -> SettingWire(key, section, label, description, "switch", JsonPrimitive(value.on))
    is SettingValue.Clock -> SettingWire(key, section, label, description, "time", JsonPrimitive(value.text))
    is SettingValue.Pick -> SettingWire(
      key, section, label, description, "choice", JsonPrimitive(value.value),
      options.map { (v, l) -> OptionWire(v, l) }
    )
  }
}

@Serializable
class AlarmWire(val id: Int?, val time: String, val enabled: Boolean, val days: List<String>, val smart: Boolean)

class AlarmInfo(
  val id: Int?,
  val hour: Int,
  val minute: Int,
  val enabled: Boolean,
  val days: List<String>,
  val smart: Boolean
) {
  fun wire(): AlarmWire = AlarmWire(id, "%02d:%02d".format(hour, minute), enabled, days, smart)

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

@Serializable
class FaceInfo(val id: String, val name: String, val active: Boolean, val removable: Boolean)

@Serializable
class GoalInfo(val key: String, val sent: Int?, val reported: Int?, val shown: Boolean?)

@Serializable
class ConfigWire(
  val settings: List<SettingWire>,
  val alarms: List<AlarmWire>,
  val faces: List<FaceInfo>,
  val goals: List<GoalInfo>,
  val sports: List<String>
)

class WatchConfigSnapshot(
  val settings: List<SettingInfo>,
  val alarms: List<AlarmInfo>,
  val faces: List<FaceInfo>,
  val goals: List<GoalInfo>,
  val sports: List<String>
) {
  fun wire(): ConfigWire =
    ConfigWire(settings.map { it.wire() }, alarms.map { it.wire() }, faces, goals, sports)

  fun json(): String = HubJson.encode(wire())
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
