package expo.modules.healthconnect.watch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

object FindPhone {
  private const val CHANNEL = "smarteverything.find-phone"
  private const val NOTIFICATION_ID = 7404
  const val ACTION_FOUND = "expo.modules.healthconnect.watch.FOUND_PHONE"
  private var ringtone: Ringtone? = null
  private var restoreVolume: Int? = null

  fun start(context: Context) {
    if (ringtone?.isPlaying == true) {
      return
    }
    val audio = context.getSystemService(AudioManager::class.java)
    restoreVolume = audio.getStreamVolume(AudioManager.STREAM_ALARM)
    audio.setStreamVolume(AudioManager.STREAM_ALARM, audio.getStreamMaxVolume(AudioManager.STREAM_ALARM), 0)
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    ringtone = RingtoneManager.getRingtone(context, uri)?.apply {
      audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
      isLooping = true
      play()
    }
    vibrate(context)
    notify(context)
    WatchEvents.emit("find_phone", if (ringtone == null) "no ringtone could be played; vibrating only" else "ringing")
  }

  fun stop(context: Context) {
    ringtone?.stop()
    ringtone = null
    restoreVolume?.let {
      context.getSystemService(AudioManager::class.java).setStreamVolume(AudioManager.STREAM_ALARM, it, 0)
    }
    restoreVolume = null
    vibrator(context)?.cancel()
    context.getSystemService(NotificationManager::class.java).cancel(NOTIFICATION_ID)
    WatchEvents.emit("find_phone_stopped", "stopped")
  }

  private fun vibrate(context: Context) {
    val pattern = longArrayOf(0, 600, 400)
    vibrator(context)?.vibrate(VibrationEffect.createWaveform(pattern, 0))
  }

  private fun vibrator(context: Context): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      context.getSystemService(Vibrator::class.java)
    }

  private fun notify(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Find my phone", NotificationManager.IMPORTANCE_HIGH))
    val found = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, FoundPhoneReceiver::class.java).setAction(ACTION_FOUND),
      PendingIntent.FLAG_IMMUTABLE
    )
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Your watch is looking for this phone")
      .setContentText("Tap to stop")
      .setContentIntent(found)
      .setDeleteIntent(found)
      .setOngoing(true)
      .addAction(Notification.Action.Builder(null, "Found it", found).build())
      .build()
    manager.notify(NOTIFICATION_ID, notification)
  }
}

class FoundPhoneReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    FindPhone.stop(context)
    WatchActions.send(WatchAction.StopFindPhone())
  }
}
