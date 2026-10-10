package expo.modules.healthconnect.watch.xiaomi

import android.content.Context
import android.text.format.DateFormat
import expo.modules.healthconnect.watch.CalendarEntry
import expo.modules.healthconnect.watch.MusicState
import expo.modules.healthconnect.watch.PhoneNotification
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.WatchAction
import expo.modules.healthconnect.watch.WatchEvent
import expo.modules.healthconnect.watch.WatchUser
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

object XiaomiActions {
  private const val TYPE_SYSTEM = 2
  private const val TYPE_NOTIFICATION = 7
  private const val TYPE_HEALTH = 8
  private const val TYPE_MUSIC = 18
  private const val TYPE_CALENDAR = 12
  private const val FIELD_CALENDAR = 14
  private const val CALENDAR_SET = 1
  private const val FIELD_SYSTEM = 4
  private const val FIELD_NOTIFICATION = 9
  private const val FIELD_HEALTH = 10
  private const val FIELD_MUSIC = 20
  private const val SYSTEM_CLOCK = 3
  private const val SYSTEM_FIND_PHONE = 17
  private const val SYSTEM_FIND_WATCH = 18
  const val NOTIFICATION_SEND = 0
  const val NOTIFICATION_DISMISS = 1
  const val CALL_REJECT = 2
  const val CALL_IGNORE = 5
  const val OPEN_ON_PHONE = 8
  const val MUSIC_GET = 0
  private const val MUSIC_SEND = 1
  const val MUSIC_BUTTON = 2
  private const val HEALTH_USER_INFO = 0
  private const val QUARTER_HOUR_SECONDS = 900
  private val STAMP = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")

  fun encode(action: WatchAction, context: Context): ByteArray = when (action) {
    is WatchAction.FindWatch -> system(SYSTEM_FIND_WATCH, ProtoWriter().varint(5, if (action.on) 0 else 1))
    is WatchAction.StopFindPhone -> system(SYSTEM_FIND_PHONE, ProtoWriter().varint(5, 1))
    is WatchAction.SetTime -> system(SYSTEM_CLOCK, ProtoWriter().message(4, clock(context)))
    is WatchAction.Notify -> notification(NOTIFICATION_SEND, ProtoWriter().message(3, card(action.notification)))
    is WatchAction.Dismiss -> notification(NOTIFICATION_DISMISS, dismiss(action.id, action.packageName))
    is WatchAction.IncomingCall -> notification(NOTIFICATION_SEND, ProtoWriter().message(3, call(action)))
    is WatchAction.CallEnded -> notification(NOTIFICATION_DISMISS, dismiss(0, "phone"))
    is WatchAction.Music -> command(TYPE_MUSIC, MUSIC_SEND, FIELD_MUSIC, ProtoWriter().message(1, music(action.state)))
    is WatchAction.SetUser -> command(TYPE_HEALTH, HEALTH_USER_INFO, FIELD_HEALTH, ProtoWriter().message(1, user(action.user)))
    is WatchAction.Calendar -> command(TYPE_CALENDAR, CALENDAR_SET, FIELD_CALENDAR, ProtoWriter().message(2, calendar(action.events)))
    is WatchAction.Weather -> throw IllegalArgumentException("weather is sent as several commands by XiaomiWeather")
  }

  fun event(command: XiaomiCommand): WatchEvent? = when (command.type) {
    TYPE_SYSTEM -> if (command.subtype == SYSTEM_FIND_PHONE) {
      WatchEvent.FindPhone(command.part(FIELD_SYSTEM)?.int(5) == 0)
    } else {
      null
    }
    TYPE_NOTIFICATION -> notificationEvent(command)
    TYPE_MUSIC -> musicEvent(command)
    else -> null
  }

  fun isFindWatchEcho(command: XiaomiCommand): Boolean = command.type == TYPE_SYSTEM && command.subtype == SYSTEM_FIND_WATCH

  private fun notificationEvent(command: XiaomiCommand): WatchEvent? {
    val body = command.part(FIELD_NOTIFICATION)
    return when (command.subtype) {
      CALL_REJECT -> WatchEvent.RejectCall()
      CALL_IGNORE -> WatchEvent.IgnoreCall()
      OPEN_ON_PHONE -> body?.message(2)?.int(1)?.let { WatchEvent.OpenNotification(it) }
      NOTIFICATION_DISMISS -> body?.message(4)?.message(1)?.int(1)?.let { WatchEvent.DismissNotification(it) }
      else -> null
    }
  }

  private fun musicEvent(command: XiaomiCommand): WatchEvent? = when (command.subtype) {
    MUSIC_GET -> WatchEvent.MusicWanted()
    MUSIC_BUTTON -> command.part(FIELD_MUSIC)?.message(2)?.let { mediaKey(it.int(1), it.int(2)) }
    else -> null
  }

  private fun mediaKey(key: Int?, volume: Int?): WatchEvent.MediaKey? = when (key) {
    0 -> WatchEvent.MediaKey(WatchEvent.MediaKey.Key.PLAY)
    1 -> WatchEvent.MediaKey(WatchEvent.MediaKey.Key.PAUSE)
    3 -> WatchEvent.MediaKey(WatchEvent.MediaKey.Key.PREVIOUS)
    4 -> WatchEvent.MediaKey(WatchEvent.MediaKey.Key.NEXT)
    5 -> WatchEvent.MediaKey(if ((volume ?: 0) >= 50) WatchEvent.MediaKey.Key.VOLUME_UP else WatchEvent.MediaKey.Key.VOLUME_DOWN)
    else -> null
  }

  private fun command(type: Int, subtype: Int, field: Int, body: ProtoWriter): ByteArray =
    ProtoWriter().varint(1, type.toLong()).varint(2, subtype.toLong()).message(field, body).toByteArray()

  private fun system(subtype: Int, body: ProtoWriter) = command(TYPE_SYSTEM, subtype, FIELD_SYSTEM, body)

  private fun notification(subtype: Int, body: ProtoWriter) = command(TYPE_NOTIFICATION, subtype, FIELD_NOTIFICATION, body)

  private fun clock(context: Context): ProtoWriter {
    val now = ZonedDateTime.now()
    val zone = ZoneId.systemDefault()
    val rules = zone.rules
    val instant = now.toInstant()
    val dst = rules.getDaylightSavings(instant).seconds.toInt()
    val standard = rules.getStandardOffset(instant).totalSeconds
    return ProtoWriter()
      .message(1, ProtoWriter().varint(1, now.year.toLong()).varint(2, now.monthValue.toLong()).varint(3, now.dayOfMonth.toLong()))
      .message(
        2,
        ProtoWriter().varint(1, now.hour.toLong()).varint(2, now.minute.toLong())
          .varint(3, now.second.toLong()).varint(4, (now.nano / 1_000_000).toLong())
      )
      .message(
        3,
        ProtoWriter().sint(1, standard / QUARTER_HOUR_SECONDS).sint(2, dst / QUARTER_HOUR_SECONDS).string(3, zone.id)
      )
      .varint(4, if (DateFormat.is24HourFormat(context)) 0 else 1)
  }

  private fun card(notification: PhoneNotification): ProtoWriter {
    val writer = ProtoWriter()
      .string(1, notification.packageName)
      .string(2, notification.appName)
      .string(3, notification.title)
      .string(4, "")
      .string(5, notification.body)
      .string(6, STAMP.format(notification.time.atZone(ZoneId.systemDefault())))
      .varint(7, notification.id.toLong())
    if (notification.canOpen) {
      writer.string(12, "0|${notification.packageName}|${notification.id}|null|0").varint(13, 1)
    }
    return writer
  }

  private fun call(action: WatchAction.IncomingCall): ProtoWriter = ProtoWriter()
    .string(1, "phone")
    .string(2, "phone")
    .string(3, action.name.ifEmpty { "?" })
    .string(4, "")
    .string(5, action.number.ifEmpty { "?" })
    .string(6, STAMP.format(ZonedDateTime.now()))
    .varint(7, 0)
    .varint(8, 1)
    .varint(11, 0)

  private fun dismiss(id: Int, packageName: String): ProtoWriter =
    ProtoWriter().message(4, ProtoWriter().message(1, ProtoWriter().varint(1, id.toLong()).string(2, packageName)))

  private fun music(state: MusicState): ProtoWriter {
    val code = when (state.playing) {
      null -> 0
      true -> 1
      false -> 2
    }
    val writer = ProtoWriter().varint(1, code.toLong()).varint(2, state.volumePercent.toLong())
    if (state.playing != null) {
      writer.string(4, state.track).string(5, state.artist)
        .varint(6, state.positionSeconds.toLong()).varint(7, state.durationSeconds.toLong())
    }
    return writer
  }

  private fun calendar(events: List<CalendarEntry>): ProtoWriter {
    val list = ProtoWriter()
    events.forEach { event ->
      val entry = ProtoWriter()
        .string(1, event.title)
        .string(2, event.description)
        .string(3, event.location)
        .varint(4, event.startSeconds)
        .varint(5, event.endSeconds)
        .varint(6, if (event.allDay) 1 else 0)
      event.remindMinutes?.let { entry.varint(7, it.toLong()) }
      list.message(1, entry)
    }
    return list.varint(2, 0)
  }

  private fun user(user: WatchUser): ProtoWriter {
    val writer = ProtoWriter()
      .varint(1, user.heightCm.toLong())
      .float(2, user.weightKg.toFloat())
      .varint(3, user.birthDate.replace("-", "").toLong())
      .varint(4, if (user.female) 2 else 1)
      .varint(5, user.maxHeartRate.toLong())
      .varint(6, user.calorieGoal.toLong())
      .varint(7, user.stepGoal.toLong())
    if (user.activeMinutes > 0) {
      writer.varint(11, user.activeMinutes.toLong())
    }
    return writer
  }
}
