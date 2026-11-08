package expo.modules.healthconnect.network

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.healthconnect.R
import expo.modules.healthconnect.diagnostics.NativeLog

class AndroidUpdateInstalledReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
    if (launch == null) {
      NativeLog.warn("android-update", "relaunch.launch_unavailable")
      return
    }
    if (Settings.canDrawOverlays(context)) {
      context.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      NativeLog.info("android-update", "relaunch.started")
    } else {
      notify(context, launch)
    }
  }

  private fun notify(context: Context, launch: Intent) {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (!manager.areNotificationsEnabled()) {
      NativeLog.warn("android-update", "relaunch.unavailable")
      return
    }
    if (manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT))
    }
    val open = PendingIntent.getActivity(context, NOTIFICATION_ID, launch, PendingIntent.FLAG_IMMUTABLE)
    val notification = Notification.Builder(context, CHANNEL).apply {
      setSmallIcon(R.drawable.ic_stat_smarteverything)
      setContentTitle("Update installed")
      setContentText("Tap to open SmartEverything")
      setContentIntent(open)
      setAutoCancel(true)
    }.build()
    manager.notify(NOTIFICATION_ID, notification)
  }

  private companion object {
    const val CHANNEL = "smarteverything.app-updates"
    const val NOTIFICATION_ID = 7520
  }
}
