package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.SettingInfo
import expo.modules.healthconnect.watch.SettingValue

class StandingGroup : SettingGroup(HEALTH, 12, 13, HEALTH_FIELD, 9) {
  private var enabled = false
  private var start = 6 to 0
  private var end = 22 to 0
  private var quiet = false
  private var quietStart = 12 to 0
  private var quietEnd = 14 to 0

  override fun keys() = listOf("standing.enabled", "standing.start", "standing.end", "standing.quiet", "standing.quiet_start", "standing.quiet_end")

  override fun decode(message: ProtoMessage) {
    enabled = message.bool(1) ?: false
    start = hourMinute(message.message(2))
    end = hourMinute(message.message(3))
    quiet = message.bool(4) ?: false
    quietStart = hourMinute(message.message(6))
    quietEnd = hourMinute(message.message(7))
  }

  override fun apply(key: String, raw: Any) {
    when (key) {
      "standing.enabled" -> enabled = flag(raw)
      "standing.start" -> start = clock(raw)
      "standing.end" -> end = clock(raw)
      "standing.quiet" -> quiet = flag(raw)
      "standing.quiet_start" -> quietStart = clock(raw)
      else -> quietEnd = clock(raw)
    }
  }

  override fun encode(): ProtoWriter = ProtoWriter()
    .varint(1, if (enabled) 1 else 0)
    .message(2, hourMinute(start))
    .message(3, hourMinute(end))
    .varint(4, if (quiet) 1 else 0)
    .message(6, hourMinute(quietStart))
    .message(7, hourMinute(quietEnd))

  override fun describe() = listOf(
    SettingInfo("standing.enabled", SECTION, "Remind me to stand up", null, SettingValue.Flag(enabled)),
    SettingInfo("standing.start", SECTION, "From", null, clockValue(start)),
    SettingInfo("standing.end", SECTION, "Until", null, clockValue(end)),
    SettingInfo("standing.quiet", SECTION, "Quiet break", "No reminders during this time", SettingValue.Flag(quiet)),
    SettingInfo("standing.quiet_start", SECTION, "Break starts", null, clockValue(quietStart)),
    SettingInfo("standing.quiet_end", SECTION, "Break ends", null, clockValue(quietEnd))
  )

  private companion object {
    const val SECTION = "Stand-up reminder"
  }
}

class GoalNotificationGroup : SettingGroup(HEALTH, 21, 22, HEALTH_FIELD, 13) {
  private var enabled = false

  override fun keys() = listOf("goals.notification")

  override fun decode(message: ProtoMessage) {
    enabled = message.bool(1) ?: false
  }

  override fun apply(key: String, raw: Any) {
    enabled = flag(raw)
  }

  override fun encode(): ProtoWriter = ProtoWriter().varint(1, if (enabled) 1 else 0).varint(2, 1)

  override fun describe() = listOf(
    SettingInfo("goals.notification", "Goals", "Celebrate reaching a goal", null, SettingValue.Flag(enabled))
  )
}

class VitalityGroup : SettingGroup(HEALTH, 35, 36, HEALTH_FIELD, 14) {
  private var sevenDay = false
  private var daily = false

  override fun keys() = listOf("vitality.seven_day", "vitality.daily")

  override fun decode(message: ProtoMessage) {
    sevenDay = message.bool(1) ?: false
    daily = message.bool(2) ?: false
  }

  override fun apply(key: String, raw: Any) {
    if (key == "vitality.seven_day") sevenDay = flag(raw) else daily = flag(raw)
  }

  override fun encode(): ProtoWriter = ProtoWriter().varint(1, if (sevenDay) 1 else 0).varint(2, if (daily) 1 else 0)

  override fun describe() = listOf(
    SettingInfo("vitality.seven_day", "Vitality", "Seven-day vitality reminders", null, SettingValue.Flag(sevenDay)),
    SettingInfo("vitality.daily", "Vitality", "Daily progress reminders", null, SettingValue.Flag(daily))
  )
}

class SleepModeGroup : SettingGroup(SCHEDULE, 8, 9, SCHEDULE_FIELD, 9) {
  private var enabled = false
  private var start = 22 to 0
  private var end = 6 to 0

  override fun keys() = listOf("sleep_mode.enabled", "sleep_mode.start", "sleep_mode.end")

  override fun decode(message: ProtoMessage) {
    enabled = message.bool(1) ?: false
    val schedule = message.message(2)
    start = hourMinute(schedule?.message(1))
    end = hourMinute(schedule?.message(2))
  }

  override fun apply(key: String, raw: Any) {
    when (key) {
      "sleep_mode.enabled" -> enabled = flag(raw)
      "sleep_mode.start" -> start = clock(raw)
      else -> end = clock(raw)
    }
  }

  override fun encode(): ProtoWriter = ProtoWriter()
    .varint(1, if (enabled) 1 else 0)
    .message(2, ProtoWriter().message(1, hourMinute(start)).message(2, hourMinute(end)).varint(3, 0))

  override fun describe() = listOf(
    SettingInfo("sleep_mode.enabled", SECTION, "Sleep mode on a schedule", "Quiets the watch at night", SettingValue.Flag(enabled)),
    SettingInfo("sleep_mode.start", SECTION, "Starts", null, clockValue(start)),
    SettingInfo("sleep_mode.end", SECTION, "Ends", null, clockValue(end))
  )

  private companion object {
    const val SECTION = "Sleep mode"
  }
}
