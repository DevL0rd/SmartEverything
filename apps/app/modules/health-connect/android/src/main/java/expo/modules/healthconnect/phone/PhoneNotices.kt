package expo.modules.healthconnect.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

object PhoneNotices {
  private const val CHANNEL = "smarteverything.open-on-phone"
  private const val NOTIFICATION_ID = 7504
  private val SCHEMES = setOf("https", "http", "geo", "tel", "mailto")

  fun openUrl(context: Context, url: String, label: String): PhoneActionResult {
    val uri = Uri.parse(url)
    if (uri.scheme !in SCHEMES) {
      return PhoneActionResult(false, "Only ${SCHEMES.joinToString()} links can be opened; received \"${uri.scheme}\"")
    }
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Open on this phone", NotificationManager.IMPORTANCE_HIGH))
    val open = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(label)
      .setContentText("Tap to open")
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    manager.notify(NOTIFICATION_ID, notification)
    return PhoneActionResult(true, "Shown on the phone; tap to open")
  }
}
