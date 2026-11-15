package expo.modules.healthconnect.planner

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.R
import expo.modules.healthconnect.diagnostics.NativeLog
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.json.JSONException

object SleepSoundNow {
  @Volatile var title: String? = null
    private set

  @Volatile var endsAt: Instant? = null
    private set

  fun playing(): Boolean = title != null

  internal fun set(title: String?, endsAt: Instant?) {
    this.title = title
    this.endsAt = endsAt
  }

  fun toMap(): Map<String, Any?> = mapOf("playing" to playing(), "title" to title, "endsAt" to endsAt?.toString())
}

object SleepSounds {
  const val SERVICE = "expo.modules.healthconnect.planner.SleepSoundService"
  const val ACTION_START = "expo.modules.healthconnect.planner.SLEEP_START"
  const val ACTION_STOP = "expo.modules.healthconnect.planner.SLEEP_STOP"
  const val EXTRA_REQUEST = "request"

  fun start(context: Context, requestJson: String) {
    SleepRequest.parse(requestJson)
    context.startForegroundService(
      Intent(ACTION_START).setClassName(context.packageName, SERVICE).putExtra(EXTRA_REQUEST, requestJson)
    )
  }

  fun stop(context: Context) {
    context.stopService(Intent(ACTION_START).setClassName(context.packageName, SERVICE))
  }
}

class SleepSoundService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var player: SleepPlayer? = null
  private var request: SleepRequest? = null
  private var startedAt = 0L
  private var generation = 0
  private var wake: PowerManager.WakeLock? = null

  private val fade = object : Runnable {
    override fun run() {
      val current = request ?: return
      val elapsed = SystemClock.elapsedRealtime() - startedAt
      if (SleepFade.finished(elapsed, current.timerMillis)) {
        NativeLog.info(SCOPE, "timer.finished")
        stopSelf()
        return
      }
      player?.volume(SleepFade.volume(elapsed, current.timerMillis, current.fadeMillis))
      handler.postDelayed(this, FADE_STEP_MILLIS)
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    NativeGuard.run("SleepSoundService") {
      val text = intent?.getStringExtra(SleepSounds.EXTRA_REQUEST)
      if (intent?.action == SleepSounds.ACTION_STOP || text == null) {
        stopSelf()
      } else {
        begin(text)
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    release()
    if (SleepSoundNow.playing()) {
      SleepSoundNow.set(null, null)
      PlannerEvents.emit("sleep_sound", "stopped", mapOf("state" to "stopped"))
    }
    super.onDestroy()
  }

  private fun begin(text: String) {
    val parsed = try {
      SleepRequest.parse(text)
    } catch (failure: JSONException) {
      startForegroundNotice(notice("Sleep sound"))
      failWith("the sleep sound request is unreadable: ${failure.message}")
      return
    }
    release()
    request = parsed
    generation += 1
    startForegroundNotice(notice(parsed.source.title))
    val source = parsed.source
    if (source is SleepSource.Files) {
      fetch(parsed, source)
    } else {
      play(parsed, emptyList())
    }
  }

  private fun fetch(parsed: SleepRequest, source: SleepSource.Files) {
    val token = generation
    val cache = RingFiles.cacheOf(this, RingFiles.SLEEP_DIRECTORY)
    Thread({
      var incomplete = true
      NativeGuard.run("SleepSoundFiles") { incomplete = runBlocking { cache.sync(source.files) } }
      handler.post {
        val tracks = source.files.mapNotNull { cache.pathOf(it)?.let(SleepTrack::Local) }
        if (token != generation) {
          return@post
        }
        if (incomplete || tracks.size != source.files.size) {
          failWith("the sleep sound file could not be downloaded to this phone")
        } else {
          play(parsed, tracks)
        }
      }
    }, "planner-sleep-files").start()
  }

  private fun play(parsed: SleepRequest, tracks: List<SleepTrack>) {
    val created = playerOf(parsed.source, tracks)
    player = created
    wake = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_TAG).also { it.acquire() }
    startedAt = SystemClock.elapsedRealtime()
    created.volume(SleepFade.volume(0, parsed.timerMillis, parsed.fadeMillis))
    created.start()
    val endsAt = parsed.timerMillis?.let { Instant.now().plusMillis(it) }
    SleepSoundNow.set(parsed.source.title, endsAt)
    PlannerEvents.emit(
      "sleep_sound",
      "playing",
      mapOf("state" to "playing", "title" to parsed.source.title, "endsAt" to endsAt?.toString())
    )
    NativeLog.info(SCOPE, "playing") { mapOf("kind" to parsed.source.javaClass.simpleName) }
    if (parsed.timerMillis != null) {
      fade.run()
    }
  }

  private fun playerOf(source: SleepSource, tracks: List<SleepTrack>): SleepPlayer = when (source) {
    is SleepSource.Noise -> NoisePlayer(source.colour)
    is SleepSource.Files -> MediaSleepPlayer(this, handler, tracks, source.shuffle, ::failWith)
    is SleepSource.Radio -> MediaSleepPlayer(this, handler, listOf(SleepTrack.Stream(source.url)), false, ::failWith)
  }

  private fun failWith(reason: String) {
    NativeLog.warn(SCOPE, "failed") { mapOf("reason" to reason) }
    PlannerEvents.emit("sleep_sound", reason, mapOf("state" to "failed", "reason" to reason))
    stopSelf()
  }

  private fun release() {
    handler.removeCallbacks(fade)
    player?.stop()
    player = null
    wake?.takeIf { it.isHeld }?.release()
    wake = null
  }

  private fun startForegroundNotice(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun notice(title: String): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Sleep sounds", NotificationManager.IMPORTANCE_LOW))
    val stop = PendingIntent.getService(
      this,
      0,
      Intent(SleepSounds.ACTION_STOP).setClassName(packageName, SleepSounds.SERVICE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("Sleep sound")
      .setContentText(title)
      .setOngoing(true)
      .addAction(Notification.Action.Builder(null, "Stop", stop).build())
      .build()
  }

  private companion object {
    const val SCOPE = "planner-sleep"
    const val CHANNEL = "smarteverything.sleep"
    const val NOTIFICATION_ID = 7512
    const val WAKE_TAG = "smarteverything:sleep-sound"
    const val FADE_STEP_MILLIS = 500L
  }
}
