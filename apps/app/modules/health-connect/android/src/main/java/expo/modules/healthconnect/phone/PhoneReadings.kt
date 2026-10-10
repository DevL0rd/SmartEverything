package expo.modules.healthconnect.phone

import android.app.AppOpsManager
import android.app.NotificationManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.media.AudioManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.util.Log
import expo.modules.healthconnect.media.NowPlaying
import expo.modules.healthconnect.watch.WatchNotificationListener
import java.time.LocalDate
import java.time.ZoneId

object PhoneReadings {
  private const val PERCENT = 100
  private const val BATTERY_STEP = 5
  private const val BATTERY_EXACT_BELOW = 20
  private const val TAG = "SmartEverythingPhone"
  private const val MINUTE_MS = 60_000L

  fun read(context: Context, withScreenTime: Boolean): Map<String, Any?> {
    val readings = power(context) + network(context) + sound(context) + media()
    return if (withScreenTime) readings + screenTime(context) else readings
  }

  fun media(nowPlaying: NowPlaying?): Map<String, Any?> = mapOf(
    "playback" to when (nowPlaying?.playing) {
      true -> "playing"
      false -> "paused"
      null -> "stopped"
    },
    "now_playing" to nowPlaying?.takeIf { it.track.isNotEmpty() }?.let { listOf(it.track, it.artist).filter(String::isNotEmpty).joinToString(" · ") }
  )

  private fun media(): Map<String, Any?> = media(WatchNotificationListener.active?.nowPlaying())

  private fun power(context: Context): Map<String, Any?> {
    val battery = context.getSystemService(BatteryManager::class.java)
    val level = steppedBattery(battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY))
    return buildMap {
      if (level != null) put("battery", level)
      put("charging", battery.isCharging)
      put("screen_on", context.getSystemService(PowerManager::class.java).isInteractive)
    }
  }

  private fun steppedBattery(percent: Int): Int? {
    if (percent < 0 || percent > PERCENT) {
      Log.w(TAG, "The battery level could not be read (got $percent); expected 0 to $PERCENT")
      return null
    }
    return if (percent <= BATTERY_EXACT_BELOW) percent else percent / BATTERY_STEP * BATTERY_STEP
  }

  private fun network(context: Context): Map<String, Any?> {
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val capabilities = connectivity.activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
    val kind = when {
      capabilities == null -> "offline"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      else -> "other"
    }
    return mapOf("network" to kind)
  }

  private fun sound(context: Context): Map<String, Any?> {
    val audio = context.getSystemService(AudioManager::class.java)
    val notifications = context.getSystemService(NotificationManager::class.java)
    return mapOf(
      "ringer_mode" to when (audio.ringerMode) {
        AudioManager.RINGER_MODE_SILENT -> "silent"
        AudioManager.RINGER_MODE_VIBRATE -> "vibrate"
        else -> "normal"
      },
      "dnd" to (notifications.currentInterruptionFilter > NotificationManager.INTERRUPTION_FILTER_ALL),
      "volume" to percentOf(audio, AudioManager.STREAM_MUSIC)
    )
  }

  fun percentOf(audio: AudioManager, stream: Int): Int =
    audio.getStreamVolume(stream) * PERCENT / audio.getStreamMaxVolume(stream)

  private fun screenTime(context: Context): Map<String, Any?> {
    if (!PhoneStore(context).sensor(PhoneSensor.SCREEN_TIME) || !usageAllowed(context)) {
      return emptyMap()
    }
    val start = LocalDate.now().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    val usage = context.getSystemService(UsageStatsManager::class.java)
    val visible = usage.queryAndAggregateUsageStats(start, System.currentTimeMillis()).values
      .sumOf { if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) it.totalTimeVisible else it.totalTimeInForeground }
    return mapOf("screen_time_today" to (visible / MINUTE_MS).toInt())
  }

  fun usageAllowed(context: Context): Boolean {
    val ops = context.getSystemService(AppOpsManager::class.java)
    @Suppress("DEPRECATION")
    val mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    return mode == AppOpsManager.MODE_ALLOWED
  }
}
