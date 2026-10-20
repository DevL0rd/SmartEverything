package expo.modules.healthconnect.toothbrush

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
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.RelayNotification
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.relayTarget

interface UploadSink {
  fun accepted(deviceId: String, result: BatchResult)

  fun conflict(deviceId: String)
}

object BrushUpload {
  private const val WORK_NAME = "expo.modules.healthconnect.sonicare-upload"
  private const val CONFLICT = 409
  private const val SCOPE = "toothbrush"

  suspend fun drain(context: Context, sink: UploadSink): Boolean {
    val client = HubClient(relayTarget(context))
    while (true) {
      val batch = BrushOutbox.peek(context) ?: return true
      try {
        val body = HubJson.decode<FrameBatch>(batch.body)
        val result = client.post<FrameBatch, BatchResult>("/api/toothbrushes/${batch.deviceId}/frames", body)
        BrushOutbox.acknowledge(context, batch)
        sink.accepted(batch.deviceId, result)
      } catch (failure: IngestUnavailable) {
        NativeLog.info(SCOPE, "upload.waiting") { mapOf("reason" to failure.javaClass.simpleName) }
        return false
      } catch (failure: IngestRejected) {
        BrushOutbox.acknowledge(context, batch)
        NativeLog.warn(SCOPE, "upload.rejected", failure) { mapOf("status" to failure.status) }
        if (failure.status == CONFLICT) {
          BrushOutbox.forget(context, batch.deviceId)
          sink.conflict(batch.deviceId)
        }
      }
    }
  }

  fun resume(context: Context) {
    if (!BrushOutbox.pending(context)) return
    val request = OneTimeWorkRequestBuilder<BrushUploadWorker>()
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .build()
    WorkManager.getInstance(context).enqueueUniqueWork(WORK_NAME, ExistingWorkPolicy.KEEP, request)
  }
}

private object QuietSink : UploadSink {
  override fun accepted(deviceId: String, result: BatchResult) = Unit

  override fun conflict(deviceId: String) = Unit
}

class BrushUploadWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result =
    if (BrushUpload.drain(applicationContext, QuietSink)) Result.success() else Result.retry()

  override suspend fun getForegroundInfo(): ForegroundInfo = RelayNotification.forScale(applicationContext)
}
