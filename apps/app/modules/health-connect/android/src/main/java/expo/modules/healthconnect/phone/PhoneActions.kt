package expo.modules.healthconnect.phone

import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
import android.os.Build
import expo.modules.healthconnect.watch.FindPhone
import expo.modules.healthconnect.watch.WatchNotificationListener
import org.json.JSONObject

enum class PhoneActionType(val wire: String) {
  RING("ring"),
  SET_VOLUME("set_volume"),
  SET_RINGER("set_ringer"),
  SET_DND("set_dnd"),
  FLASHLIGHT("flashlight"),
  MEDIA("media"),
  OPEN_URL("open_url"),
  REFRESH("refresh"),
  SET_BRIGHTNESS("set_brightness"),
  SET_AUTO_BRIGHTNESS("set_auto_brightness"),
  SET_TIMEOUT("set_timeout"),
  SET_FLASHLIGHT_LEVEL("set_flashlight_level"),
  SEEK("seek"),
  LAUNCH_APP("launch_app"),
  DISMISS_NOTIFICATION("dismiss_notification"),
  LOCK("lock"),
  SHOW_UNLOCK("show_unlock"),
  SCREENSHOT("screenshot"),
  RECEIVE_FILE("receive_file"),
  LIVE("live");

  companion object {
    fun of(wire: String): PhoneActionType = entries.firstOrNull { it.wire == wire } ?: throw PhoneActionUnknown(wire)
  }
}

data class PhoneActionResult(val ok: Boolean, val detail: String, val image: String? = null)

object PhoneActions {
  private const val PERCENT = 100
  private const val MS_PER_SECOND = 1000
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

  internal val handlers: Map<PhoneActionType, (Context, JSONObject) -> PhoneActionResult> = mapOf(
    PhoneActionType.RING to { context, action -> ring(context, action.getBoolean("on")) },
    PhoneActionType.SET_VOLUME to { context, action -> volume(context, action.getString("stream"), action.getInt("percent")) },
    PhoneActionType.SET_RINGER to { context, action -> ringer(context, action.getString("mode")) },
    PhoneActionType.SET_DND to { context, action -> dnd(context, action.getBoolean("on")) },
    PhoneActionType.FLASHLIGHT to { context, action -> PhoneFlashlight.set(context, action.getString("mode")) },
    PhoneActionType.MEDIA to { _, action -> media(action.getString("key")) },
    PhoneActionType.OPEN_URL to { context, action -> PhoneNotices.openUrl(context, action.getString("url"), action.getString("label")) },
    PhoneActionType.REFRESH to { _, _ -> PhoneActionResult(true, "Sent a fresh report") },
    PhoneActionType.SET_BRIGHTNESS to { context, action -> PhoneSettingsWrite.brightness(context, action.getInt("percent")) },
    PhoneActionType.SET_AUTO_BRIGHTNESS to { context, action -> PhoneSettingsWrite.autoBrightness(context, action.getBoolean("on")) },
    PhoneActionType.SET_TIMEOUT to { context, action -> PhoneSettingsWrite.timeout(context, action.getInt("seconds")) },
    PhoneActionType.SET_FLASHLIGHT_LEVEL to { context, action -> PhoneFlashlight.setLevel(context, action.getInt("percent")) },
    PhoneActionType.SEEK to { _, action -> seek(action.getLong("positionMs")) },
    PhoneActionType.LAUNCH_APP to { context, action -> PhoneLaunch.run(context, action.getString("app")) },
    PhoneActionType.DISMISS_NOTIFICATION to { context, action -> PhoneNotificationsDetail.dismiss(context, action.getJSONObject("target")) },
    PhoneActionType.LOCK to { context, _ -> lock(context) },
    PhoneActionType.SHOW_UNLOCK to { context, _ -> PhoneShowUnlock.show(context) },
    PhoneActionType.SCREENSHOT to { context, _ -> screenshot(context) },
    PhoneActionType.RECEIVE_FILE to { context, action -> PhoneFiles.receive(context, action) },
    PhoneActionType.LIVE to { context, action -> live(context, action.getBoolean("on")) }
  )

  fun run(context: Context, action: JSONObject): PhoneActionResult {
    val type = PhoneActionType.of(action.getString("type"))
    val result = handlers.getValue(type)(context, action)
    PhoneReporter.report(context, full = type == PhoneActionType.REFRESH)
    return result
  }

  private fun lock(context: Context): PhoneActionResult {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) throw PhoneLockUnsupported()
    return PhoneAccessibility.lock(context)
  }

  private fun screenshot(context: Context): PhoneActionResult {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) throw PhoneScreenshotUnsupported()
    return PhoneAccessibility.screenshot(context)
  }

  private fun live(context: Context, on: Boolean): PhoneActionResult {
    PhoneLive.set(context, on)
    return PhoneActionResult(true, if (on) "Live mode on" else "Live mode off")
  }

  private fun seek(positionMs: Long): PhoneActionResult {
    val controls = WatchNotificationListener.active?.transport() ?: throw PhoneMediaNothingPlaying()
    controls.seekTo(positionMs)
    return PhoneActionResult(true, "Moved to ${positionMs / MS_PER_SECOND} seconds")
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
