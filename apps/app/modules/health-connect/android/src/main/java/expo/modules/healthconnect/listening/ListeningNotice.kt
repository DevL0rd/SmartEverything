package expo.modules.healthconnect.listening

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context

object ListeningNotice {
  const val CHANNEL = "smarteverything.listening"
  const val NOTIFICATION_ID = 7412

  fun ensureChannel(context: Context) {
    context.getSystemService(NotificationManager::class.java)
      .createNotificationChannel(NotificationChannel(CHANNEL, "Listening", NotificationManager.IMPORTANCE_LOW))
  }

  fun build(context: Context, state: ListeningState): Notification =
    Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(titleOf(state))
      .setContentText(state.detail ?: "Say the assistant's name to wake it")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setContentIntent(openApp(context))
      .addAction(
        Notification.Action.Builder(null, "Turn off", ListeningService.pending(context, ListeningService.ACTION_STOP)).build()
      )
      .build()

  fun reopen(context: Context) {
    ensureChannel(context)
    context.getSystemService(NotificationManager::class.java).notify(
      NOTIFICATION_ID,
      Notification.Builder(context, CHANNEL)
        .setSmallIcon(context.applicationInfo.icon)
        .setContentTitle("Listening is paused")
        .setContentText("Open SmartEverything to turn it back on")
        .setContentIntent(openApp(context))
        .setAutoCancel(true)
        .build()
    )
  }

  private fun titleOf(state: ListeningState): String = when (state.status) {
    ListeningStatus.Listening -> "Listening for the wake word"
    ListeningStatus.Resting -> "Listening is resting"
    ListeningStatus.Unavailable -> "Listening is unavailable"
    ListeningStatus.Off -> "Listening"
  }

  private fun openApp(context: Context): PendingIntent? =
    context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
}
