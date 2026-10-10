package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.SettingInfo
import expo.modules.healthconnect.watch.SettingValue

class BadSetting(detail: String) : IllegalArgumentException(detail)

abstract class SettingGroup(val type: Int, val get: Int, val set: Int, val field: Int, private val bodyField: Int) {
  var known = false
    private set

  fun accepts(command: XiaomiCommand): Boolean = command.type == type && command.subtype == get

  fun read(command: XiaomiCommand) {
    command.part(field)?.message(bodyField)?.let {
      decode(it)
      known = true
    }
  }

  fun request(): ByteArray = ProtoWriter().varint(1, type.toLong()).varint(2, get.toLong()).toByteArray()

  fun change(key: String, raw: Any): ByteArray? {
    if (!known || keys().none { it == key }) {
      return null
    }
    apply(key, raw)
    return ProtoWriter().varint(1, type.toLong()).varint(2, set.toLong())
      .message(field, ProtoWriter().message(bodyField, encode())).toByteArray()
  }

  fun settings(): List<SettingInfo> = if (known) describe() else emptyList()

  protected abstract fun keys(): List<String>
  protected abstract fun decode(message: ProtoMessage)
  protected abstract fun apply(key: String, raw: Any)
  protected abstract fun encode(): ProtoWriter
  protected abstract fun describe(): List<SettingInfo>

  companion object {
    const val HEALTH = 8
    const val SCHEDULE = 17
    const val HEALTH_FIELD = 10
    const val SCHEDULE_FIELD = 19

    fun flag(raw: Any): Boolean = if (raw is Boolean) raw else throw BadSetting("expected on or off, received $raw")

    fun pick(raw: Any, allowed: List<Pair<String, String>>): String {
      val value = raw.toString()
      if (allowed.none { it.first == value }) {
        throw BadSetting("expected one of ${allowed.joinToString { it.first }}, received $value")
      }
      return value
    }

    fun clock(raw: Any): Pair<Int, Int> {
      val match = Regex("^([01]\\d|2[0-3]):([0-5]\\d)$").matchEntire(raw.toString())
        ?: throw BadSetting("expected a time like 07:30, received $raw")
      return match.groupValues[1].toInt() to match.groupValues[2].toInt()
    }

    fun hourMinute(message: ProtoMessage?): Pair<Int, Int> = (message?.int(1) ?: 0) to (message?.int(2) ?: 0)

    fun hourMinute(time: Pair<Int, Int>): ProtoWriter =
      ProtoWriter().varint(1, time.first.toLong()).varint(2, time.second.toLong())

    fun clockValue(time: Pair<Int, Int>) = SettingValue.Clock(time.first, time.second)
  }
}

class HeartRateGroup : SettingGroup(HEALTH, 10, 11, HEALTH_FIELD, 8) {
  private var disabled = false
  private var interval = 0
  private var high = 0
  private var low = 0
  private var sleepMonitoring = false
  private var breathing = false

  override fun keys() = listOf("heart.interval", "heart.high_alert", "heart.low_alert", "heart.sleep_monitoring", "heart.breathing")

  override fun decode(message: ProtoMessage) {
    disabled = message.bool(1) ?: false
    interval = message.int(2) ?: 0
    high = if (message.bool(3) == true) message.int(4) ?: 0 else 0
    low = message.message(8)?.let { if (it.bool(1) == true) it.int(2) ?: 0 else 0 } ?: 0
    sleepMonitoring = message.message(5)?.bool(1) ?: false
    breathing = message.int(9) == 1
  }

  override fun apply(key: String, raw: Any) {
    when (key) {
      "heart.interval" -> pick(raw, INTERVALS).let { disabled = it == "off"; interval = if (it == "off" || it == "smart") 0 else it.toInt() }
      "heart.high_alert" -> high = pick(raw, HIGH).let { if (it == "off") 0 else it.toInt() }
      "heart.low_alert" -> low = pick(raw, LOW).let { if (it == "off") 0 else it.toInt() }
      "heart.sleep_monitoring" -> sleepMonitoring = flag(raw)
      else -> breathing = flag(raw)
    }
  }

  override fun encode(): ProtoWriter = ProtoWriter()
    .varint(1, if (disabled) 1 else 0)
    .varint(2, interval.toLong())
    .varint(3, if (high > 0) 1 else 0)
    .varint(4, high.toLong())
    .message(5, ProtoWriter().varint(1, if (sleepMonitoring) 1 else 0))
    .varint(7, 1)
    .message(8, ProtoWriter().varint(1, if (low > 0) 1 else 0).varint(2, low.toLong()))
    .varint(9, if (breathing) 1 else 2)

  override fun describe(): List<SettingInfo> {
    val intervalValue = when {
      disabled -> "off"
      interval == 0 -> "smart"
      else -> interval.toString()
    }
    return listOf(
      SettingInfo("heart.interval", SECTION, "Measure heart rate", null, SettingValue.Pick(intervalValue), INTERVALS),
      SettingInfo("heart.high_alert", SECTION, "High heart rate alert", null, SettingValue.Pick(if (high == 0) "off" else high.toString()), HIGH),
      SettingInfo("heart.low_alert", SECTION, "Low heart rate alert", null, SettingValue.Pick(if (low == 0) "off" else low.toString()), LOW),
      SettingInfo("heart.sleep_monitoring", SECTION, "Advanced sleep monitoring", "Uses heart rate to detect sleep stages", SettingValue.Flag(sleepMonitoring)),
      SettingInfo("heart.breathing", SECTION, "Sleep breathing quality", null, SettingValue.Flag(breathing))
    )
  }

  private companion object {
    const val SECTION = "Heart rate"
    val INTERVALS = listOf("off" to "Off", "smart" to "Smart", "1" to "Every minute", "10" to "Every 10 minutes", "30" to "Every 30 minutes")
    val HIGH = listOf("off" to "Off") + (100..150 step 10).map { it.toString() to "Above $it bpm" }
    val LOW = listOf("off" to "Off") + listOf(40, 45, 50).map { it.toString() to "Below $it bpm" }
  }
}

class Spo2Group : SettingGroup(HEALTH, 8, 9, HEALTH_FIELD, 7) {
  private var allDay = false
  private var low = 0

  override fun keys() = listOf("spo2.all_day", "spo2.low_alert")

  override fun decode(message: ProtoMessage) {
    allDay = message.int(2) == 2
    low = message.message(4)?.let { if (it.bool(1) == true) it.int(2) ?: 0 else 0 } ?: 0
  }

  override fun apply(key: String, raw: Any) {
    if (key == "spo2.all_day") allDay = flag(raw) else low = pick(raw, LOW).let { if (it == "off") 0 else it.toInt() }
  }

  override fun encode(): ProtoWriter {
    val alarm = ProtoWriter().varint(1, if (low > 0) 1 else 0)
    if (low > 0) alarm.varint(2, low.toLong())
    return ProtoWriter().varint(1, 1).varint(2, if (allDay) 2 else 0).message(4, alarm)
  }

  override fun describe() = listOf(
    SettingInfo("spo2.all_day", SECTION, "Measure all day", null, SettingValue.Flag(allDay)),
    SettingInfo("spo2.low_alert", SECTION, "Low oxygen alert", null, SettingValue.Pick(if (low == 0) "off" else low.toString()), LOW)
  )

  private companion object {
    const val SECTION = "Blood oxygen"
    val LOW = listOf("off" to "Off") + listOf(90, 85, 80).map { it.toString() to "Below $it%" }
  }
}

class StressGroup : SettingGroup(HEALTH, 14, 15, HEALTH_FIELD, 10) {
  private var allDay = false
  private var relax = false

  override fun keys() = listOf("stress.all_day", "stress.relax_reminder")

  override fun decode(message: ProtoMessage) {
    allDay = message.bool(1) ?: false
    relax = message.message(2)?.bool(1) ?: false
  }

  override fun apply(key: String, raw: Any) {
    if (key == "stress.all_day") allDay = flag(raw) else relax = flag(raw)
  }

  override fun encode(): ProtoWriter = ProtoWriter()
    .varint(1, if (allDay) 1 else 0)
    .message(2, ProtoWriter().varint(1, if (relax) 1 else 0).varint(2, 0))

  override fun describe() = listOf(
    SettingInfo("stress.all_day", "Stress", "Measure all day", null, SettingValue.Flag(allDay)),
    SettingInfo("stress.relax_reminder", "Stress", "Relax reminder", null, SettingValue.Flag(relax))
  )
}
