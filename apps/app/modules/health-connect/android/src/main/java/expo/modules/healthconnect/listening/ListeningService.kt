package expo.modules.healthconnect.listening

import android.Manifest
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import expo.modules.healthconnect.voice.VoiceCapture
import expo.modules.healthconnect.voice.VoiceCaptureUnavailable
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class ListeningNotAllowed(reason: String) : Exception("Listening cannot start: $reason")

class ListeningService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default.limitedParallelism(1))
  private val counters = ListeningCounters.shared
  private var config: ListeningConfig? = null
  private var ear: WakeEar? = null
  private var segments: EarSegments? = null
  private var reports: HubReports? = null
  private var capture: AutoCloseable? = null
  private var power: ListeningPower? = null
  private var sources: PowerSources? = null
  private var resting: String? = null
  private var paused: String? = null
  private var foreground = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    foreground = enterForeground()
    if (!foreground) {
      stopSelf()
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (!foreground) {
      return START_NOT_STICKY
    }
    val action = intent?.action
    val text = intent?.getStringExtra(EXTRA_CONFIG)
    val reason = intent?.getStringExtra(EXTRA_REASON) ?: "resting"
    scope.launch {
      when (action) {
        ACTION_CONFIGURE -> if (text != null) configure(HubJson.decode<ListeningConfig>(text))
        ACTION_REST -> rest(reason)
        ACTION_RESUME -> resume()
        else -> stopSelf()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    scope.launch {
      release()
      WakeReplay.release()
      counters.restEnded()
      Log.d(TAG, counters.summary())
      ListeningEvents.publish(ListeningState(ListeningStatus.Off))
    }.invokeOnCompletion { scope.cancel() }
    super.onDestroy()
  }

  private fun configure(next: ListeningConfig) {
    try {
      release()
      config = next
      ear = earOf(next)
      if (next.wake && ear == null) {
        stopSelf()
        return
      }
      reports = HubReports(relayTarget(this), scope)
      watchPower(next.powerMode)
      settle()
    } catch (failure: ListeningConfigInvalid) {
      unavailable(failure)
    } catch (failure: IOException) {
      unavailable(failure)
    } catch (failure: SyncFailure) {
      unavailable(failure)
    }
  }

  private fun earOf(next: ListeningConfig): WakeEar? {
    if (!next.wake) {
      return null
    }
    val model = WakeModel.install(this)
    val lines = next.lines(WakeModel.vocabulary(model))
    if (lines.isEmpty()) {
      return null
    }
    val keywords = File(cacheDir, KEYWORDS_FILE).apply { writeText(KeywordLines.render(lines)) }
    return WakeEar(model, keywords, next.threshold, this, counters, ::heard)
  }

  private fun watchPower(mode: PowerMode) {
    val tracker = ListeningPower(mode, PowerSources.snapshot(this)) { scope.launch { settle() } }
    power = tracker
    sources = PowerSources(this, mode, tracker, scope)
  }

  private fun settle() {
    if (config == null) {
      return
    }
    val reason = resting ?: power?.reason()
    if (reason == null) {
      if (capture == null) listen()
    } else if (reason != paused) {
      pause(reason)
    }
  }

  private fun heard(wake: WakeHeard) {
    if (WakeReplay.holding()) {
      return
    }
    WakeReplay.begin(wake.preroll)
    ListeningEvents.wake(wake)
  }

  private fun listen() {
    try {
      val current = reports
      val written = config?.takeIf { it.transcribe }?.let { EarSegments(this, it.pauseMs, { current?.segment(it) }) }
      segments = written
      val meter = LevelMeter({ ListeningEvents.levelsWatched }, { current?.level(it) })
      val intake = EarIntake(ear, written, meter, counters)
      capture = VoiceCapture.addConsumer(VoiceCapture.Mode.Ear, intake::hear)
      paused = null
      counters.restEnded()
      publish(ListeningState(ListeningStatus.Listening, null, config?.transcribe == true))
    } catch (failure: VoiceCaptureUnavailable) {
      unavailable(failure)
    }
  }

  private fun rest(reason: String) {
    resting = reason
    settle()
  }

  private fun resume() {
    resting = null
    WakeReplay.release()
    settle()
  }

  private fun pause(reason: String) {
    paused = reason
    closeCapture()
    ear?.rest()
    counters.restBegan()
    publish(ListeningState(ListeningStatus.Resting, reason, config?.transcribe == true))
  }

  private fun closeCapture() {
    capture?.close()
    capture = null
    segments?.close()
    segments = null
  }

  private fun release() {
    sources?.close()
    sources = null
    power = null
    paused = null
    closeCapture()
    ear?.close()
    ear = null
    reports = null
  }

  private fun unavailable(failure: Exception) {
    Log.w(TAG, "listening unavailable: ${failure.message}")
    release()
    config = null
    WakeReplay.release()
    publish(ListeningState(ListeningStatus.Unavailable, failure.message))
  }

  private fun publish(state: ListeningState) {
    ListeningEvents.publish(state)
    getSystemService(NotificationManager::class.java).notify(ListeningNotice.NOTIFICATION_ID, ListeningNotice.build(this, state))
  }

  private fun enterForeground(): Boolean {
    ListeningNotice.ensureChannel(this)
    val notification = ListeningNotice.build(this, ListeningEvents.state.value)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        startForeground(ListeningNotice.NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(ListeningNotice.NOTIFICATION_ID, notification)
      }
      true
    } catch (failure: SecurityException) {
      refused(failure)
    } catch (failure: IllegalStateException) {
      refused(failure)
    }
  }

  private fun refused(failure: Exception): Boolean {
    Log.w(TAG, "Android did not let listening start: ${failure.message}")
    ListeningNotice.reopen(this)
    return false
  }

  companion object {
    const val ACTION_CONFIGURE = "expo.modules.healthconnect.listening.CONFIGURE"
    const val ACTION_REST = "expo.modules.healthconnect.listening.REST"
    const val ACTION_RESUME = "expo.modules.healthconnect.listening.RESUME"
    const val ACTION_STOP = "expo.modules.healthconnect.listening.STOP"
    const val EXTRA_CONFIG = "config"
    const val EXTRA_REASON = "reason"
    private const val KEYWORDS_FILE = "wake-keywords.txt"
    private const val TAG = "SmartEverythingListening"

    fun configure(context: Context, config: ListeningConfig) {
      if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        throw ListeningNotAllowed("the microphone permission is not granted")
      }
      try {
        context.startForegroundService(
          intent(context, ACTION_CONFIGURE).putExtra(EXTRA_CONFIG, HubJson.encode(config))
        )
      } catch (failure: IllegalStateException) {
        throw ServiceStartRefused("the listening service", failure)
      }
    }

    fun rest(context: Context, reason: String) = running(context, ACTION_REST) { it.putExtra(EXTRA_REASON, reason) }

    fun resume(context: Context) = running(context, ACTION_RESUME)

    fun stop(context: Context) = running(context, ACTION_STOP)

    fun pending(context: Context, action: String): PendingIntent =
      PendingIntent.getService(context, action.hashCode(), intent(context, action), PendingIntent.FLAG_IMMUTABLE)

    private fun running(context: Context, action: String, extras: (Intent) -> Intent = { it }) {
      if (ListeningEvents.state.value.status != ListeningStatus.Off) {
        context.startService(extras(intent(context, action)))
      }
    }

    private fun intent(context: Context, action: String): Intent =
      Intent(context, ListeningService::class.java).setAction(action)
  }
}
