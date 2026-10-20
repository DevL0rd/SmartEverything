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
  private const val SCALE_ID = 7401
  private const val PHONE_ID = 7405

  fun forScale(context: Context): ForegroundInfo = build(context, "Saving a weigh-in", SCALE_ID)

  fun forPhone(context: Context): ForegroundInfo = build(context, "Sending a phone update", PHONE_ID)

  private fun build(context: Context, title: String, id: Int): ForegroundInfo {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(CHANNEL, "Background sending", NotificationManager.IMPORTANCE_MIN)
    )
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(title)
      .build()
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ForegroundInfo(id, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      ForegroundInfo(id, notification)
    }
  }
}
