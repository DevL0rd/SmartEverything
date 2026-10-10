package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.ActionOutcome
import expo.modules.healthconnect.watch.AlarmInfo
import expo.modules.healthconnect.watch.FaceInfo
import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.WatchConfigSnapshot
import expo.modules.healthconnect.watch.WatchUser
import expo.modules.healthconnect.watch.parseProto

class XiaomiConfig(
  private val send: (ByteArray) -> Unit,
  private val goals: XiaomiGoals,
  private val sports: () -> List<String>,
  private val changed: (WatchConfigSnapshot) -> Unit
) {
  private val groups: List<SettingGroup> = listOf(
    HeartRateGroup(), Spo2Group(), StressGroup(), StandingGroup(), GoalNotificationGroup(), VitalityGroup(), SleepModeGroup()
  )
  private var alarms: List<AlarmInfo> = emptyList()
  private var faces: List<FaceInfo> = emptyList()

  fun requestAll() {
    groups.forEach { send(it.request()) }
    send(simple(SettingGroup.SCHEDULE, ALARMS_GET))
    send(simple(FACES, FACES_LIST))
    send(goals.request())
  }

  fun userSent(user: WatchUser) {
    goals.userSent(user)
    publish()
  }

  fun handle(command: XiaomiCommand): Boolean {
    if (goals.handle(command)) {
      publish()
      return true
    }
    groups.firstOrNull { it.accepts(command) }?.let {
      it.read(command)
      publish()
      return true
    }
    return when {
      command.type == SettingGroup.SCHEDULE && command.subtype == ALARMS_GET -> readAlarms(command).let { true }
      command.type == SettingGroup.SCHEDULE && command.subtype in ALARM_ACKS -> send(simple(SettingGroup.SCHEDULE, ALARMS_GET)).let { true }
      command.type == SettingGroup.SCHEDULE && command.subtype == SLEEP_MODE_SET -> true
      command.type == FACES && command.subtype == FACES_LIST -> readFaces(command).let { true }
      command.type == FACES && command.subtype in FACE_ACKS -> send(simple(FACES, FACES_LIST)).let { true }
      command.type == SettingGroup.HEALTH && command.subtype in groups.map { it.set } -> true
      else -> false
    }
  }

  fun setting(key: String, raw: Any): ActionOutcome {
    val group = groups.firstOrNull { group -> group.settings().any { it.key == key } }
      ?: return ActionOutcome(false, "This watch has no setting called $key, or it has not been read yet.")
    return try {
      val command = group.change(key, raw) ?: return ActionOutcome(false, "$key has not been read from the watch yet.")
      send(command)
      send(group.request())
      ActionOutcome(true, "Changed $key on the watch.")
    } catch (bad: BadSetting) {
      ActionOutcome(false, "$key: ${bad.message}")
    }
  }

  fun saveAlarm(alarm: AlarmInfo): ActionOutcome {
    if (alarm.days.any { it !in AlarmInfo.WEEKDAYS }) {
      return ActionOutcome(false, "Alarm days must be mon to sun.")
    }
    val details = alarmDetails(alarm)
    val id = alarm.id
    if (id == null) {
      send(schedule(ALARM_CREATE, ProtoWriter().message(2, details)))
      return ActionOutcome(true, "Added an alarm at ${"%02d:%02d".format(alarm.hour, alarm.minute)}.")
    }
    if (alarms.none { it.id == id }) {
      return ActionOutcome(false, "The watch has no alarm $id.")
    }
    send(schedule(ALARM_EDIT, ProtoWriter().message(3, ProtoWriter().varint(1, id.toLong()).message(2, details))))
    return ActionOutcome(true, "Changed alarm $id.")
  }

  fun deleteAlarm(id: Int): ActionOutcome {
    if (alarms.none { it.id == id }) {
      return ActionOutcome(false, "The watch has no alarm $id.")
    }
    send(schedule(ALARM_DELETE, ProtoWriter().message(5, ProtoWriter().varint(1, id.toLong()))))
    return ActionOutcome(true, "Deleted alarm $id.")
  }

  fun setFace(id: String): ActionOutcome {
    val face = faces.firstOrNull { it.id == id } ?: return ActionOutcome(false, "The watch has no face $id.")
    send(face(FACES_SET, id))
    return ActionOutcome(true, "Switched to ${face.name}.")
  }

  fun deleteFace(id: String): ActionOutcome {
    val face = faces.firstOrNull { it.id == id } ?: return ActionOutcome(false, "The watch has no face $id.")
    if (!face.removable || face.active) {
      return ActionOutcome(false, "${face.name} can’t be removed${if (face.active) " while it is in use" else ""}.")
    }
    send(face(FACES_DELETE, id))
    return ActionOutcome(true, "Removed ${face.name}.")
  }

  fun snapshot(): WatchConfigSnapshot = WatchConfigSnapshot(groups.flatMap { it.settings() }, alarms, faces, goals.snapshot(), sports())

  fun publish() = changed(snapshot())

  private fun readAlarms(command: XiaomiCommand) {
    val list = command.part(SettingGroup.SCHEDULE_FIELD)?.message(1) ?: return
    alarms = list.messages(1).map { alarmOf(it) }
    publish()
  }

  private fun readFaces(command: XiaomiCommand) {
    val list = command.part(FACES_FIELD)?.message(1) ?: return
    faces = list.messages(1).map {
      FaceInfo(it.string(1).orEmpty(), it.string(2).orEmpty().ifEmpty { "Watch face" }, it.bool(3) ?: false, it.bool(4) ?: false)
    }
    publish()
  }

  private fun alarmOf(info: ProtoMessage): AlarmInfo {
    val details = info.message(2)
    val (hour, minute) = SettingGroup.hourMinute(details?.message(2))
    val days = when (details?.int(3)) {
      REPEAT_DAILY -> AlarmInfo.WEEKDAYS
      REPEAT_WEEKLY -> AlarmInfo.WEEKDAYS.filterIndexed { index, _ -> ((details.int(4) ?: 0) shr index) and 1 == 1 }
      else -> emptyList()
    }
    return AlarmInfo(info.int(1), hour, minute, details?.bool(5) ?: false, days, details?.int(7) == SMART)
  }

  private fun alarmDetails(alarm: AlarmInfo): ProtoWriter {
    val flags = alarm.days.sumOf { 1 shl AlarmInfo.WEEKDAYS.indexOf(it) }
    val writer = ProtoWriter().message(2, SettingGroup.hourMinute(alarm.hour to alarm.minute))
    when {
      alarm.days.isEmpty() -> writer.varint(3, REPEAT_ONCE.toLong())
      alarm.days.size == 7 -> writer.varint(3, REPEAT_DAILY.toLong())
      else -> writer.varint(3, REPEAT_WEEKLY.toLong()).varint(4, flags.toLong())
    }
    return writer.varint(5, if (alarm.enabled) 1 else 0).varint(7, if (alarm.smart) SMART.toLong() else NORMAL.toLong())
  }

  private fun simple(type: Int, subtype: Int) = ProtoWriter().varint(1, type.toLong()).varint(2, subtype.toLong()).toByteArray()

  private fun schedule(subtype: Int, body: ProtoWriter) = ProtoWriter()
    .varint(1, SettingGroup.SCHEDULE.toLong()).varint(2, subtype.toLong())
    .message(SettingGroup.SCHEDULE_FIELD, body).toByteArray()

  private fun face(subtype: Int, id: String) = ProtoWriter()
    .varint(1, FACES.toLong()).varint(2, subtype.toLong())
    .message(FACES_FIELD, ProtoWriter().string(2, id)).toByteArray()

  private companion object {
    const val ALARMS_GET = 0
    const val ALARM_CREATE = 1
    const val ALARM_EDIT = 2
    const val ALARM_DELETE = 4
    const val SLEEP_MODE_SET = 9
    val ALARM_ACKS = setOf(ALARM_CREATE, ALARM_EDIT, ALARM_DELETE)
    const val REPEAT_ONCE = 0
    const val REPEAT_DAILY = 1
    const val REPEAT_WEEKLY = 5
    const val SMART = 1
    const val NORMAL = 2
    const val FACES = 4
    const val FACES_FIELD = 6
    const val FACES_LIST = 0
    const val FACES_SET = 1
    const val FACES_DELETE = 2
    val FACE_ACKS = setOf(FACES_SET, FACES_DELETE)
  }
}

private fun ProtoMessage.messages(field: Int): List<ProtoMessage> = all(field).map { parseProto(it) }
