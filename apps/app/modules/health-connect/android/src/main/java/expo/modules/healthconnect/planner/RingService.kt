package expo.modules.healthconnect.planner

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.R
import expo.modules.healthconnect.diagnostics.NativeLog
import java.io.IOException
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList

object RingingNow {
  private val keys = CopyOnWriteArrayList<String>()

  fun keys(): List<String> = keys.toList()

  internal fun add(ringKey: String) {
    keys.remove(ringKey)
    keys.add(ringKey)
  }

  internal fun remove(ringKey: String) {
    keys.remove(ringKey)
  }
}

object RingControl {
  const val ACTION_SNOOZE = "expo.modules.healthconnect.planner.SNOOZE"
  const val ACTION_STOP = "expo.modules.healthconnect.planner.STOP"
  const val EXTRA_MINUTES = "minutes"

  fun snooze(context: Context, ringKey: String, minutes: Int?) {
    val intent = intent(context, ACTION_SNOOZE, ringKey)
    minutes?.let { intent.putExtra(EXTRA_MINUTES, it) }
    context.startService(intent)
  }

  fun stop(context: Context, ringKey: String) {
    context.startService(intent(context, ACTION_STOP, ringKey))
  }

  fun intent(context: Context, action: String, ringKey: String): Intent =
    Intent(action)
      .setClassName(context.packageName, AlarmScheduler.RING_SERVICE)
      .setData(Uri.fromParts("ring", ringKey, null))
      .putExtra(AlarmScheduler.EXTRA_RING_KEY, ringKey)
}

class RingService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var player: MediaPlayer? = null
  private var playing: PhoneRing? = null
  private var playingSince = 0L

  private val ramp = object : Runnable {
    override fun run() {
      val ring = playing ?: return
      val volume = RingRamp.volume(SystemClock.elapsedRealtime() - playingSince, ring.rampSeconds)
      player?.setVolume(volume, volume)
      if (volume < 1f) {
        handler.postDelayed(this, RAMP_STEP_MILLIS)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val key = intent?.getStringExtra(AlarmScheduler.EXTRA_RING_KEY)
    NativeGuard.run("RingService") {
      when (intent?.action) {
        AlarmScheduler.ACTION_RING -> if (key != null) ring(key) else settle()
        RingControl.ACTION_SNOOZE -> if (key != null) snooze(key, intent?.getIntExtra(RingControl.EXTRA_MINUTES, 0) ?: 0) else settle()
        RingControl.ACTION_STOP -> if (key != null) stop(key) else settle()
        else -> settle()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    silence()
    super.onDestroy()
  }

  private fun ring(key: String) {
    val base = RingKeys.baseOf(key)
    val ring = AlarmScheduler.of(this).ringOf(base)
    if (ring == null) {
      NativeLog.warn("planner-alarm", "ring.unknown") { mapOf("ringKey" to key) }
      startForegroundNotice(genericNotice())
      settle()
      return
    }
    if (!RingKeys.isSnooze(key)) {
      AlarmScheduler.of(this).fired(base)
    }
    RingingNow.add(base)
    startForegroundNotice(notice(ring))
    play(ring)
    NativeLog.info("planner-alarm", "ringing") { mapOf("kind" to ring.kind.wire) }
  }

  private fun snooze(key: String, minutes: Int) {
    val base = RingKeys.baseOf(key)
    val scheduler = AlarmScheduler.of(this)
    val ring = scheduler.ringOf(base)
    if (ring != null) {
      scheduler.snooze(ring, if (minutes > 0) minutes else ring.snoozeMinutes)
    }
    release(base)
  }

  private fun stop(key: String) {
    val base = RingKeys.baseOf(key)
    AlarmScheduler.of(this).cancelSnooze(base)
    release(base)
  }

  private fun release(base: String) {
    RingingNow.remove(base)
    val manager = getSystemService(NotificationManager::class.java)
    val next = RingingNow.keys().lastOrNull()?.let { AlarmScheduler.of(this).ringOf(it) }
    if (next == null) {
      settle()
      return
    }
    manager.notify(NOTIFICATION_ID, notice(next))
    play(next)
  }

  private fun settle() {
    silence()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun startForegroundNotice(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun play(ring: PhoneRing) {
    silence()
    playing = ring
    playingSince = SystemClock.elapsedRealtime()
    player = start(ring.sound) ?: start(DEFAULT_SOUND)
    if (player == null) {
      NativeLog.warn("planner-alarm", "sound.unavailable") { mapOf("sound" to ring.sound) }
    }
    if (ring.vibrate) {
      vibrator()?.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), ALARM_ATTRIBUTES)
    }
    ramp.run()
  }

  private fun start(sound: String): MediaPlayer? {
    val uri = (if (sound == DEFAULT_SOUND) defaultUri() else Uri.parse(sound)) ?: return null
    val created = MediaPlayer()
    return try {
      created.setAudioAttributes(ALARM_ATTRIBUTES)
      created.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
      created.setDataSource(this, uri)
      created.isLooping = true
      created.prepare()
      created.setVolume(RingRamp.FLOOR, RingRamp.FLOOR)
      created.start()
      created
    } catch (failure: IOException) {
      NativeLog.warn("planner-alarm", "sound.failed", failure) { mapOf("sound" to sound) }
      created.release()
      null
    } catch (failure: IllegalStateException) {
      NativeLog.warn("planner-alarm", "sound.failed", failure) { mapOf("sound" to sound) }
      created.release()
      null
    }
  }

  private fun silence() {
    handler.removeCallbacks(ramp)
    player?.release()
    player = null
    playing = null
    vibrator()?.cancel()
  }

  private fun defaultUri(): Uri? =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      getSystemService(Vibrator::class.java)
    }

  private fun genericNotice(): Notification = builder().setContentTitle("Alarm").build()

  private fun notice(ring: PhoneRing): Notification {
    val open = open(ring.ringKey)
    val title = ring.label ?: if (ring.kind == RingKind.TIMER) "Timer" else "Alarm"
    val text = if (ring.kind == RingKind.TIMER) "Time is up" else "Ringing now"
    val builder = builder()
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setWhen(Instant.now().toEpochMilli())
      .addAction(Notification.Action.Builder(null, "Snooze", action(RingControl.ACTION_SNOOZE, ring.ringKey)).build())
      .addAction(Notification.Action.Builder(null, "Stop", action(RingControl.ACTION_STOP, ring.ringKey)).build())
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || manager.canUseFullScreenIntent()) {
      builder.setFullScreenIntent(open, true)
    }
    return builder.build()
  }

  private fun builder(): Notification.Builder {
    val manager = getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL, "Alarms and timers", NotificationManager.IMPORTANCE_HIGH)
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.setBypassDnd(true)
    manager.createNotificationChannel(channel)
    return Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setCategory(Notification.CATEGORY_ALARM)
      .setOngoing(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
  }

  private fun open(ringKey: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, RingKeys.linkOf(SCHEME, ringKey))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(this, ringKey.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun action(action: String, ringKey: String): PendingIntent =
    PendingIntent.getService(
      this,
      ringKey.hashCode(),
      RingControl.intent(this, action, ringKey),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private companion object {
    const val CHANNEL = "smarteverything.ring"
    const val NOTIFICATION_ID = 7511
    const val SCHEME = "smarteverything"
    const val DEFAULT_SOUND = "default"
    const val RAMP_STEP_MILLIS = 250L
    val VIBRATION = longArrayOf(0, 700, 500)
    val ALARM_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
      .build()
  }
}
