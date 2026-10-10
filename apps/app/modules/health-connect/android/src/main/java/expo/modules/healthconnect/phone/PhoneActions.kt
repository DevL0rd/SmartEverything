package expo.modules.healthconnect.phone

import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
import expo.modules.healthconnect.watch.FindPhone
import expo.modules.healthconnect.watch.WatchNotificationListener
import org.json.JSONObject

enum class PhoneActionType(val wire: String) {
  RING("ring"),
  SET_VOLUME("set_volume"),
  SET_RINGER("set_ringer"),
  SET_DND("set_dnd"),
  MEDIA("media"),
  OPEN_URL("open_url"),
  REFRESH("refresh");

  companion object {
    fun of(wire: String): PhoneActionType = entries.firstOrNull { it.wire == wire } ?: throw PhoneActionUnknown(wire)
  }
}

data class PhoneActionResult(val ok: Boolean, val detail: String)

object PhoneActions {
  private const val PERCENT = 100
  private val STREAMS = mapOf(
    "media" to AudioManager.STREAM_MUSIC,
    "ring" to AudioManager.STREAM_RING,
    "alarm" to AudioManager.STREAM_ALARM,
    "notification" to AudioManager.STREAM_NOTIFICATION
  )
  private val RINGER = mapOf(
    "normal" to AudioManager.RINGER_MODE_NORMAL,
    "vibrate" to AudioManager.RINGER_MODE_VIBRATE,
    "silent" to AudioManager.RINGER_MODE_SILENT
  )

  fun run(context: Context, action: JSONObject): PhoneActionResult {
    val result = when (PhoneActionType.of(action.getString("type"))) {
      PhoneActionType.RING -> ring(context, action.getBoolean("on"))
      PhoneActionType.SET_VOLUME -> volume(context, action.getString("stream"), action.getInt("percent"))
      PhoneActionType.SET_RINGER -> ringer(context, action.getString("mode"))
      PhoneActionType.SET_DND -> dnd(context, action.getBoolean("on"))
      PhoneActionType.MEDIA -> media(action.getString("key"))
      PhoneActionType.OPEN_URL -> PhoneNotices.openUrl(context, action.getString("url"), action.getString("label"))
      PhoneActionType.REFRESH -> PhoneActionResult(true, "Sent a fresh report")
    }
    PhoneReporter.report(context, full = action.getString("type") == PhoneActionType.REFRESH.wire)
    return result
  }

  private fun ring(context: Context, on: Boolean): PhoneActionResult {
    if (on) FindPhone.start(context) else FindPhone.stop(context)
    return PhoneActionResult(true, if (on) "Ringing" else "Stopped ringing")
  }

  private fun volume(context: Context, stream: String, percent: Int): PhoneActionResult {
    val type = STREAMS[stream] ?: return PhoneActionResult(false, "Unknown volume \"$stream\"; expected one of ${STREAMS.keys}")
    val audio = context.getSystemService(AudioManager::class.java)
    val level = percent.coerceIn(0, PERCENT) * audio.getStreamMaxVolume(type) / PERCENT
    audio.setStreamVolume(type, level, 0)
    return PhoneActionResult(true, "${stream.replaceFirstChar { it.uppercase() }} volume ${PhoneReadings.percentOf(audio, type)}%")
  }

  private fun ringer(context: Context, mode: String): PhoneActionResult {
    val value = RINGER[mode] ?: return PhoneActionResult(false, "Unknown ringer mode \"$mode\"; expected one of ${RINGER.keys}")
    if (!PhonePermissions.dndAccess(context) && value == AudioManager.RINGER_MODE_SILENT) {
      return PhoneActionResult(false, "Silent mode needs Do Not Disturb access for SmartEverything on the phone")
    }
    context.getSystemService(AudioManager::class.java).ringerMode = value
    return PhoneActionResult(true, "Ringer set to $mode")
  }

  private fun dnd(context: Context, on: Boolean): PhoneActionResult {
    if (!PhonePermissions.dndAccess(context)) {
      return PhoneActionResult(false, "Do Not Disturb access is not allowed for SmartEverything on the phone")
    }
    val filter = if (on) NotificationManager.INTERRUPTION_FILTER_PRIORITY else NotificationManager.INTERRUPTION_FILTER_ALL
    context.getSystemService(NotificationManager::class.java).setInterruptionFilter(filter)
    return PhoneActionResult(true, if (on) "Do Not Disturb on" else "Do Not Disturb off")
  }

  private fun media(key: String): PhoneActionResult {
    val controls = WatchNotificationListener.active?.transport()
      ?: return PhoneActionResult(false, "Nothing is playing, or notification access is off on the phone")
    when (key) {
      "play" -> controls.play()
      "pause" -> controls.pause()
      "next" -> controls.skipToNext()
      "previous" -> controls.skipToPrevious()
      else -> return PhoneActionResult(false, "Unknown media key \"$key\"; expected play, pause, next or previous")
    }
    return PhoneActionResult(true, "Sent $key")
  }
}
