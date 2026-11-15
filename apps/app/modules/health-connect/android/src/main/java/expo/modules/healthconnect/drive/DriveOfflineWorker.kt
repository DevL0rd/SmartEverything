package expo.modules.healthconnect.drive

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import expo.modules.healthconnect.R
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.push.DriveOfflineChangedPayload
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.pushPayload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException

class DriveOfflineWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    try {
      DriveOfflineSync(DriveHub(applicationContext), DriveOfflineStore(applicationContext), DriveProviderCache(applicationContext), DriveConfig(applicationContext)).run()
      Result.success()
    } catch (failure: SyncFailure) {
      NativeLog.warn(SCOPE, "offline.sync_failed", failure) { mapOf("retryable" to failure.retryable) }
      if (failure.retryable) Result.retry() else Result.failure()
    } catch (failure: java.io.IOException) {
      NativeLog.warn(SCOPE, "offline.sync_interrupted", failure) { mapOf("type" to failure.javaClass.simpleName) }
      Result.retry()
    }
  }

  override suspend fun getForegroundInfo(): ForegroundInfo {
    val manager = applicationContext.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Files kept offline", NotificationManager.IMPORTANCE_MIN))
    val notification = Notification.Builder(applicationContext, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle("Updating files kept offline")
      .build()
    return ForegroundInfo(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
  }

  companion object {
    private const val SCOPE = "drive-offline"
    private const val CHANNEL = "smarteverything.drive.offline"
    private const val NOTIFICATION = 7421
    private const val WORK = "drive-offline-sync"

    fun enqueue(context: Context) {
      val request = OneTimeWorkRequestBuilder<DriveOfflineWorker>()
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
    }
  }
}

object DriveOfflineChangedPush : PushCommandHandler {
  override fun handle(context: Context, data: Map<String, String>) {
    try {
      data.pushPayload<DriveOfflineChangedPayload>()
    } catch (failure: SerializationException) {
      NativeLog.warn("drive-offline", "push.unreadable", failure) { mapOf("keys" to data.size) }
      return
    }
    DriveOfflineWorker.enqueue(context)
  }
}
