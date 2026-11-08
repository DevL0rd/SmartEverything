package expo.modules.healthconnect.connections

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import expo.modules.healthconnect.R

abstract class ConnectedDeviceService : Service() {
  override fun onCreate() {
    super.onCreate()
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL, "Device connections", NotificationManager.IMPORTANCE_LOW)
    )
    notices.start(this)
  }

  override fun onDestroy() {
    notices.stop(this)
    super.onDestroy()
  }

  protected fun publishConnections(devices: List<DeviceConnection>) {
    main.post { notices.update(this, devices) }
  }

  protected abstract fun foregroundRefused(failure: RuntimeException)

  private fun showConnections(summary: DeviceConnectionSummary): Boolean {
    val notification = notificationOf(summary)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (failure: SecurityException) {
      rejectForeground(failure)
    } catch (failure: IllegalStateException) {
      rejectForeground(failure)
    }
  }

  private fun rejectForeground(failure: RuntimeException): Boolean {
    foregroundRefused(failure)
    stopSelf()
    return false
  }

  private fun notificationOf(summary: DeviceConnectionSummary): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    return Notification.Builder(this, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(summary.title)
      .setContentText(summary.text)
      .setStyle(Notification.BigTextStyle().bigText(summary.text))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(open)
      .apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
        }
      }
      .build()
  }

  private companion object {
    const val CHANNEL = "smarteverything.device-connections"
    const val NOTIFICATION_ID = 7418
    val main = Handler(Looper.getMainLooper())
    val notices = DeviceConnectionNotices(
      SystemClock::uptimeMillis,
      { publication, at ->
        main.removeCallbacks(publication)
        main.postAtTime(publication, at)
      },
      main::removeCallbacks,
      ConnectedDeviceService::showConnections
    )
  }
}
