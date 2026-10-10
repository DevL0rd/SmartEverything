package expo.modules.healthconnect

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

class SyncWorker(context: Context, parameters: WorkerParameters) :
  CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val report = SyncEngine(applicationContext).run(SyncTrigger.SCHEDULED)
    return when (report.outcome) {
      SyncOutcome.SUCCEEDED -> Result.success()
      SyncOutcome.RETRYING -> Result.retry()
      SyncOutcome.FAILED -> Result.failure()
    }
  }
}

object SyncScheduler {
  private const val WORK_NAME = "expo.modules.healthconnect.sync"
  private const val MINIMUM_INTERVAL_MINUTES = 15L
  private const val BACKOFF_MINUTES = 15L

  fun schedule(context: Context, intervalMinutes: Long) {
    if (intervalMinutes < MINIMUM_INTERVAL_MINUTES) {
      throw IllegalArgumentException(
        "WorkManager runs periodic work at most every $MINIMUM_INTERVAL_MINUTES minutes; " +
          "received $intervalMinutes"
      )
    }
    val constraints = Constraints.Builder()
      .setRequiredNetworkType(NetworkType.CONNECTED)
      .setRequiresBatteryNotLow(true)
      .build()
    val request = PeriodicWorkRequestBuilder<SyncWorker>(intervalMinutes, TimeUnit.MINUTES)
      .setConstraints(constraints)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_MINUTES, TimeUnit.MINUTES)
      .build()
    WorkManager.getInstance(context)
      .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, request)
  }

  fun cancel(context: Context) {
    WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
  }
}
