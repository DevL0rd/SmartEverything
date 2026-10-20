package expo.modules.healthconnect.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.healthconnect.R
import expo.modules.healthconnect.push.PhoneActionOrigin

object PhoneNotices {
  private const val CHANNEL = "smarteverything.open-on-phone"
  private const val NOTIFICATION_ID = 7504
  private const val CAPTURE_CHANNEL = "smarteverything.screen-captures"
  private const val CAPTURE_ID = 7505
  private val SCHEMES = setOf("https", "http", "geo", "tel", "mailto")

  fun openUrl(context: Context, url: String, label: String, origin: PhoneActionOrigin): PhoneActionResult {
    val uri = Uri.parse(url)
    if (uri.scheme !in SCHEMES) {
      return PhoneActionResult(false, "Only ${SCHEMES.joinToString()} links can be opened; received \"${uri.scheme}\"")
    }
    val view = Intent(Intent.ACTION_VIEW, uri)
    if (PhoneAskers.linkOpening(origin, PhonePermissions.overlay(context)) == LinkOpening.TapToOpen) {
      return tapToOpen(context, label, view)
    }
    context.startActivity(view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return PhoneActionResult(true, "Opened $label")
  }

  fun tapToOpen(context: Context, label: String, intent: Intent): PhoneActionResult {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Open on this phone", NotificationManager.IMPORTANCE_HIGH))
    val open = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(label)
      .setContentText("Tap to open")
      .setContentIntent(open)
      .setAutoCancel(true)
      .build()
    manager.notify(NOTIFICATION_ID, notification)
    return PhoneActionResult(true, "Shown on the phone; tap to open")
  }

  fun screenCaptured(context: Context, origin: PhoneActionOrigin) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CAPTURE_CHANNEL, "Screen captures", NotificationManager.IMPORTANCE_DEFAULT))
    val notification = Notification.Builder(context, CAPTURE_CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("Your screen was captured")
      .setContentText("Asked by ${PhoneAskers.describe(origin)}")
      .setAutoCancel(true)
      .build()
    manager.notify(System.currentTimeMillis().toString(), CAPTURE_ID, notification)
  }
}
