package expo.modules.healthconnect.watch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.NativeGuard
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

object FindPhone {
  private const val CHANNEL = "smarteverything.find-phone"
  const val NOTIFICATION_ID = 7404
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
    anchor(context)
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
    context.stopService(Intent(context, FindPhoneService::class.java))
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

  private fun anchor(context: Context) {
    try {
      context.startForegroundService(Intent(context, FindPhoneService::class.java))
    } catch (failure: IllegalStateException) {
      WatchEvents.emit("find_phone_service_refused", "Android did not let the find my phone service run now, so the ring may stop if the app is closed: ${failure.message}")
      context.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(context))
    }
  }

  fun notification(context: Context): Notification {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Find my phone", NotificationManager.IMPORTANCE_HIGH))
    val found = PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, FoundPhoneReceiver::class.java).setAction(ACTION_FOUND),
      PendingIntent.FLAG_IMMUTABLE
    )
    return Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Find my phone")
      .setContentText("This phone is ringing. Tap to stop.")
      .setContentIntent(found)
      .setDeleteIntent(found)
      .setOngoing(true)
      .addAction(Notification.Action.Builder(null, "Stop ringing", found).build())
      .build()
  }
}

class FindPhoneService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = FindPhone.notification(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(FindPhone.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(FindPhone.NOTIFICATION_ID, notification)
    }
    return START_NOT_STICKY
  }
}

class FoundPhoneReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("FoundPhoneReceiver") {
      FindPhone.stop(context)
      WatchActions.send(WatchAction.StopFindPhone())
    }
  }
}
