package expo.modules.healthconnect.talk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import expo.modules.healthconnect.R
import expo.modules.healthconnect.voice.VoiceService

object TalkNotice {
  fun build(context: Context, state: TalkState): Notification {
    val store = TalkStore(context)
    val channel = store.channelName(state.live?.channelId ?: state.talkChannel.ifEmpty { null })
    val talking = state.transmit.status != "idle" || state.live != null
    return Notification.Builder(context, VoiceService.CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(titleOf(state, channel))
      .setContentText(if (state.link == "ready") channel else state.problem ?: "Connecting…")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setCategory(Notification.CATEGORY_CALL)
      .setContentIntent(openApp(context))
      .addAction(action(context, if (talking) "Stop" else "Talk", VoiceService.ACTION_TOGGLE, 1))
      .addAction(action(context, "Next channel", VoiceService.ACTION_NEXT, 2))
      .addAction(action(context, "Turn off", VoiceService.ACTION_STOP, 3))
      .build()
  }

  fun reopen(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(VoiceService.CHANNEL, "Walkie-talkie", NotificationManager.IMPORTANCE_LOW))
    manager.notify(
      VoiceService.NOTIFICATION_ID,
      Notification.Builder(context, VoiceService.CHANNEL)
        .setSmallIcon(R.drawable.ic_stat_smarteverything)
        .setContentTitle("Walkie-talkie is paused")
        .setContentText("Open SmartEverything to turn it back on")
        .setContentIntent(openApp(context))
        .setAutoCancel(true)
        .build()
    )
  }

  private fun titleOf(state: TalkState, channel: String): String = when {
    state.live != null -> "${state.live.label} is talking with $channel · mic on"
    state.transmit.status == "talking" && state.transmit.cameraId != null -> "Listening · $channel"
    state.transmit.status == "talking" -> "Talking"
    state.transmit.status == "requesting" -> "Connecting…"
    state.receive != null -> "${state.receive.speaker.label} is talking"
    state.link == "ready" -> "Walkie-talkie ready"
    else -> "Walkie-talkie"
  }

  private fun action(context: Context, title: String, action: String, code: Int): Notification.Action =
    Notification.Action.Builder(null, title, VoiceService.pending(context, action, code)).build()

  private fun openApp(context: Context): PendingIntent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
}
