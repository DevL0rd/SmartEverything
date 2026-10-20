package expo.modules.healthconnect.speech

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.R
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
class AiSpeechNotice(val id: String, val from: String, val text: String, val audio: String, val showText: Boolean = false)

class AiSpeechService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val player by lazy { AiSpeechPlayer(this) }
  private val queue = ArrayDeque<AiSpeechNotice>()
  private var lastStartId = 0
  private var fetching = 0
  private var playing = false

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    foreground(WAITING, null)
    AiSpeechPlayer.clearStale(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    lastStartId = startId
    val id = intent?.getStringExtra(EXTRA_ID)
    if (id == null) {
      Log.e(TAG, "The AI voice service was started without a speech id")
      stopWhenIdle()
      return START_NOT_STICKY
    }
    fetching += 1
    scope.launch {
      try {
        val notice = HubClient(relayTarget(this@AiSpeechService)).post<JsonObject, AiSpeechNotice>("$PATH$id/claim", JsonObject(emptyMap()))
        handler.post { arrived(notice) }
      } catch (failure: SyncFailure) {
        handler.post { dropped("the speech could not be fetched: ${failure.message}") }
      } catch (failure: Exception) {
        handler.post { dropped("the speech failed with ${failure.javaClass.simpleName}: ${failure.message}") }
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    scope.cancel()
    handler.removeCallbacksAndMessages(null)
    queue.clear()
    player.release()
    super.onDestroy()
  }

  private fun arrived(notice: AiSpeechNotice) {
    fetching -= 1
    queue.addLast(notice)
    if (!playing) playNext()
  }

  private fun dropped(reason: String) {
    Log.e(TAG, "AI speech could not be played: $reason")
    fetching -= 1
    if (!playing) playNext()
  }

  private fun playNext() {
    val notice = queue.removeFirstOrNull()
    if (notice == null) {
      stopWhenIdle()
      return
    }
    playing = true
    try {
      foreground("${notice.from} is speaking", if (notice.showText) notice.text else null)
      player.play(notice.id, notice.audio, { finished() }) { reason -> failed(reason) }
    } catch (failure: Exception) {
      failed("the speech could not be read: ${failure.javaClass.simpleName}: ${failure.message}")
    }
  }

  private fun finished() {
    playing = false
    playNext()
  }

  private fun failed(reason: String) {
    Log.e(TAG, "AI speech could not be played: $reason")
    finished()
  }

  private fun stopWhenIdle() {
    if (!playing && queue.isEmpty() && fetching == 0) stopSelfResult(lastStartId)
  }

  private fun foreground(title: String, text: String?) {
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "AI voice", NotificationManager.IMPORTANCE_LOW))
    val generic = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("SmartEverything")
      .setContentText(SPEAKING)
      .build()
    val notification = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(title)
      .apply { if (text != null) setContentText(text) }
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(generic)
      .setOngoing(true)
      .build()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (failure: SecurityException) {
      Log.e(TAG, "Android refused the AI voice service: ${failure.message}")
      stopSelf()
    } catch (failure: IllegalStateException) {
      Log.e(TAG, "Android did not let the AI voice service run in the foreground now: ${failure.message}")
      stopSelf()
    }
  }

  companion object {
    const val TAG = "SmartEverythingSpeech"
    private const val EXTRA_ID = "id"
    private const val PATH = "/api/reach/speech/"
    private const val CHANNEL = "smarteverything.ai-voice"
    private const val NOTIFICATION_ID = 7403
    private const val WAITING = "Getting a message from your AI"
    private const val SPEAKING = "Your AI is speaking"

    fun start(context: Context, id: String) {
      try {
        context.startForegroundService(Intent(context, AiSpeechService::class.java).putExtra(EXTRA_ID, id))
      } catch (failure: IllegalStateException) {
        throw ServiceStartRefused("the AI voice service", failure)
      }
    }
  }
}
