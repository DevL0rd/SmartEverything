package expo.modules.healthconnect.planner

import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.diagnostics.NativeLog
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

object RingingNow {
  private val keys = CopyOnWriteArrayList<String>()
  private val playback = ConcurrentHashMap<String, RingPlayback>()

  fun keys(): List<String> = keys.toList()

  fun playbackOf(ringKey: String): RingPlayback? = playback[ringKey]

  internal fun add(ringKey: String) {
    keys.remove(ringKey)
    keys.add(ringKey)
    playback[ringKey] = RingPlayback.PENDING
  }

  internal fun report(ringKey: String, state: RingPlayback) {
    if (keys.contains(ringKey)) {
      playback[ringKey] = state
    }
  }

  internal fun remove(ringKey: String) {
    keys.remove(ringKey)
    playback.remove(ringKey)
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
  private val sound by lazy {
    RingSoundPlayer(this, handler, RingFiles.cacheOf(this, RingFiles.RING_DIRECTORY), ::reported)
  }
  private var playing: PhoneRing? = null
  private var playingSince = 0L

  private val ramp = object : Runnable {
    override fun run() {
      val ring = playing ?: return
      val volume = RingRamp.volume(SystemClock.elapsedRealtime() - playingSince, ring.rampSeconds)
      sound.volume(volume)
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
    val scheduler = AlarmScheduler.of(this)
    val ring = scheduler.ringOf(base)
    if (ring == null) {
      NativeLog.warn("planner-alarm", "ring.unknown") { mapOf("ringKey" to key) }
      startForegroundNotice(RingNotice.generic(this))
      settle()
      return
    }
    if (!RingKeys.isSnooze(key)) {
      scheduler.fired(base)
    }
    RingingNow.add(base)
    startForegroundNotice(RingNotice.of(this, ring, scheduler.snoozesLeft(ring)))
    play(ring)
    PlannerEvents.emit("ring_started", "ringing", RingPlayback.PENDING.toMap(base, scheduler.snoozesLeft(ring)))
    NativeLog.info("planner-alarm", "ringing") { mapOf("kind" to ring.kind.wire) }
  }

  private fun snooze(key: String, minutes: Int) {
    val base = RingKeys.baseOf(key)
    val scheduler = AlarmScheduler.of(this)
    val ring = scheduler.ringOf(base)
    if (ring != null && !scheduler.snooze(ring, if (minutes > 0) minutes else ring.snoozeMinutes)) {
      NativeLog.warn("planner-alarm", "snooze.refused") { mapOf("ringKey" to base, "limit" to ring.snoozeLimit) }
      return
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
    PlannerEvents.emit("ring_ended", "ring released", mapOf("ringKey" to base))
    val scheduler = AlarmScheduler.of(this)
    val next = RingingNow.keys().lastOrNull()?.let { scheduler.ringOf(it) }
    if (next == null) {
      settle()
      return
    }
    getSystemService(NotificationManager::class.java).notify(RingNotice.ID, RingNotice.of(this, next, scheduler.snoozesLeft(next)))
    play(next)
  }

  private fun settle() {
    silence()
    StepCounter.stop()
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun startForegroundNotice(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(RingNotice.ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(RingNotice.ID, notification)
    }
  }

  private fun reported(state: RingPlayback) {
    val ring = playing ?: return
    RingingNow.report(RingKeys.baseOf(ring.ringKey), state)
    PlannerEvents.emit(
      "ring_playback",
      state.safetyNet ?: "playing",
      state.toMap(RingKeys.baseOf(ring.ringKey), AlarmScheduler.of(this).snoozesLeft(ring))
    )
  }

  private fun play(ring: PhoneRing) {
    silence()
    playing = ring
    playingSince = SystemClock.elapsedRealtime()
    sound.play(ring)
    if (ring.vibrate) {
      vibrator()?.vibrate(VibrationEffect.createWaveform(VIBRATION, 0), RingSoundPlayer.ALARM_ATTRIBUTES)
    }
    ramp.run()
  }

  private fun silence() {
    handler.removeCallbacks(ramp)
    sound.stop()
    playing = null
    vibrator()?.cancel()
  }

  private fun vibrator(): Vibrator? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      getSystemService(Vibrator::class.java)
    }

  private companion object {
    const val RAMP_STEP_MILLIS = 250L
    val VIBRATION = longArrayOf(0, 700, 500)
  }
}
