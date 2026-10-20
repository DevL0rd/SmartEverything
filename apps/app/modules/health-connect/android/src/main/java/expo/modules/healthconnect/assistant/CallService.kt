package expo.modules.healthconnect.assistant

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import expo.modules.healthconnect.R
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.overlay.OverlayControl

class ProjectionRefused : Exception("Android did not hand over the screen; share the screen again and allow it in the system prompt")

class CallService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    running = this
    getSystemService(NotificationManager::class.java)
      .createNotificationChannel(NotificationChannel(CHANNEL, "Calls", NotificationManager.IMPORTANCE_LOW))
    try {
      show(CallNotice.state() ?: CallNoticeState.fresh())
    } catch (failure: SecurityException) {
      refused(failure)
    } catch (failure: IllegalStateException) {
      refused(failure)
    }
  }

  private fun refused(failure: Exception) {
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Closed(SERVICE_REFUSED, ServiceStartRefused("the call service", failure).message.orEmpty()))
    stopSelf()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_NOT_STICKY

  override fun onDestroy() {
    running = null
    super.onDestroy()
  }

  fun show(state: CallNoticeState) {
    val notification = notification(state)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(NOTIFICATION_ID, notification, typesOf(state))
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  fun projection(resultCode: Int, data: Intent): MediaProjection {
    CallNotice.raise { it.copy(screen = true) }
    try {
      return getSystemService(MediaProjectionManager::class.java).getMediaProjection(resultCode, data)
        ?: throw ProjectionRefused()
    } catch (failure: SecurityException) {
      CallNotice.update { it.copy(screen = false) }
      throw failure
    } catch (failure: ProjectionRefused) {
      CallNotice.update { it.copy(screen = false) }
      throw failure
    }
  }

  private fun typesOf(state: CallNoticeState): Int {
    var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    if (state.camera) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
    if (state.screen) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
    return types
  }

  private fun notification(state: CallNoticeState): Notification {
    val builder = Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(if (state.screen) "Sharing your screen with the assistant" else "Call with the assistant")
      .setContentText(subtitle(state))
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setWhen(state.startedAt)
      .setUsesChronometer(true)
      .setContentIntent(openApp())
      .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
      .addAction(action(if (state.muted) "Unmute" else "Mute", OverlayControl.Mute))
    if (state.screen) {
      builder.addAction(action("Stop sharing", OverlayControl.StopShare))
    } else if (state.speaker != null) {
      builder.addAction(action(if (state.speaker) "Speaker off" else "Speaker", OverlayControl.Speaker))
    }
    return builder.addAction(action("End", OverlayControl.End)).build()
  }

  private fun subtitle(state: CallNoticeState): String = when {
    state.muted -> "Muted"
    state.camera -> "Camera on"
    else -> "Tap to return to the call"
  }

  private fun action(label: String, control: OverlayControl): Notification.Action =
    Notification.Action.Builder(null, label, CallActions.pending(this, control)).build()

  private fun openApp(): PendingIntent = PendingIntent.getActivity(
    this,
    0,
    AssistantLink.call(this, AssistantCalls.ASSIST),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  companion object {
    private const val CHANNEL = "smarteverything.calls"
    private const val NOTIFICATION_ID = 7411
    private const val SERVICE_REFUSED = 1011

    @Volatile
    var running: CallService? = null
      private set
  }
}
