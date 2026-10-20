package expo.modules.healthconnect.larq

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.RelayNotification
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.relayTarget
import java.time.Instant

object LarqSync {
  const val SYNC_PATH = "/api/bottles/%s/sync"
  const val ANSWER_PATH = "/api/bottles/action-results"
  private const val SCOPE = "larq"
  private const val UPLOAD_WORK = "expo.modules.healthconnect.larq-upload"

  fun heard(context: Context, candidates: List<LarqCandidate>) {
    val store = LarqStore(context)
    candidates.groupBy { it.serial }.forEach { (serial, heard) ->
      val bottle = store.bySerial(serial) ?: return@forEach
      val strongest = heard.maxBy { it.rssi }
      enqueue(context, bottle.deviceId, strongest.address)
    }
  }

  private fun enqueue(context: Context, deviceId: String, address: String) {
    val request = OneTimeWorkRequestBuilder<LarqSyncWorker>()
      .setInputData(workDataOf(LarqSyncWorker.DEVICE to deviceId, LarqSyncWorker.ADDRESS to address))
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork("expo.modules.healthconnect.larq-sync-$deviceId", ExistingWorkPolicy.KEEP, request)
  }

  fun enqueueUpload(context: Context) {
    val request = OneTimeWorkRequestBuilder<LarqUploadWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(UPLOAD_WORK, ExistingWorkPolicy.APPEND_OR_REPLACE, request)
  }

  suspend fun run(context: Context, bottle: PhoneBottle, address: String, trigger: String, plan: BottlePlan = bottle.plan): SyncUpload {
    val upload = LarqRunner(LarqGatt(context, address), Instant::now).run(plan, trigger)
    keep(context, bottle.deviceId, upload)
    return upload
  }

  fun keep(context: Context, deviceId: String, upload: SyncUpload) {
    LarqOutbox.remember(context, deviceId, HubJson.encode(upload))
  }

  suspend fun drain(context: Context) {
    val store = LarqStore(context)
    val client = HubClient(relayTarget(context))
    while (true) {
      val batch = LarqOutbox.peek(context) ?: return
      try {
        val result = client.post<SyncUpload, SyncResult>(SYNC_PATH.format(batch.deviceId), HubJson.decode<SyncUpload>(batch.body))
        store.replacePlan(batch.deviceId, result.plan)
      } catch (failure: IngestRejected) {
        NativeLog.warn(SCOPE, "upload.rejected", failure) { mapOf("status" to failure.status) }
      }
      LarqOutbox.acknowledge(context, batch)
    }
  }
}

class LarqSyncWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val deviceId = inputData.getString(DEVICE) ?: return Result.failure()
    val address = inputData.getString(ADDRESS) ?: return Result.failure()
    val bottle = LarqStore(applicationContext).byDevice(deviceId) ?: return Result.success()
    if (!LarqPermissions.connectAllowed(applicationContext)) return Result.failure()
    return try {
      LarqSync.run(applicationContext, bottle, address, "wake")
      LarqSync.drain(applicationContext)
      Result.success()
    } catch (failure: SyncFailure) {
      if (failure.retryable) {
        LarqSync.enqueueUpload(applicationContext)
        Result.success()
      } else {
        Result.failure()
      }
    }
  }

  override suspend fun getForegroundInfo(): ForegroundInfo = RelayNotification.forPhone(applicationContext)

  companion object {
    const val DEVICE = "deviceId"
    const val ADDRESS = "address"
  }
}

class LarqUploadWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result = try {
    LarqSync.drain(applicationContext)
    Result.success()
  } catch (failure: SyncFailure) {
    if (failure.retryable) Result.retry() else Result.failure()
  }

  override suspend fun getForegroundInfo(): ForegroundInfo = RelayNotification.forPhone(applicationContext)
}
