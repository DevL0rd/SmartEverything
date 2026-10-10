package expo.modules.healthconnect

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.app.Notification
import androidx.work.ForegroundInfo

object RelayNotification {
  private const val CHANNEL = "smarteverything.scale"
  private const val ID = 7401

  fun foregroundInfo(context: Context): ForegroundInfo {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "Scale readings", NotificationManager.IMPORTANCE_MIN)
    )
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Saving a weigh-in")
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      ForegroundInfo(ID, notification)
    }
  }
}
