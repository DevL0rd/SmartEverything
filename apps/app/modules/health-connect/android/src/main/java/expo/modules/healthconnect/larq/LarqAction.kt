package expo.modules.healthconnect.larq

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.RelayNotification
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.phone.PhonePostWorker
import expo.modules.healthconnect.push.ActionAnswer
import expo.modules.healthconnect.push.BottleActionPayload
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.pushPayload
import java.time.Instant
import kotlinx.serialization.SerializationException

object BottleActionPush : PushCommandHandler {
  private const val TAG = "SmartEverythingLarq"

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<BottleActionPayload>()
    } catch (failure: SerializationException) {
      Log.e(TAG, "A bottle command could not be read: ${failure.message}")
      return
    }
    if (LarqStore(context).byDevice(payload.deviceId) == null) {
      Log.i(TAG, "Bottle command ${payload.requestId} left to the phone that holds ${payload.deviceId}")
      return
    }
    if (!payload.expiresAt.isAfter(Instant.now())) {
      Log.w(TAG, "Bottle command ${payload.requestId} expired before it arrived (hub deadline ${payload.expiresAt}, phone clock ${Instant.now()})")
      return
    }
    val request = OneTimeWorkRequestBuilder<LarqActionWorker>()
      .setInputData(workDataOf(LarqActionWorker.PAYLOAD to HubJson.encode(payload)))
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .build()
    WorkManager.getInstance(context).enqueue(request)
  }
}

class LarqActionWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val text = inputData.getString(PAYLOAD) ?: return Result.failure()
    val payload = HubJson.decode<BottleActionPayload>(text)
    val bottle = LarqStore(applicationContext).byDevice(payload.deviceId)
    if (bottle == null) {
      answer(payload.requestId, false, "The bottle is not linked to this phone; open SmartEverything and let it sync first.")
      return Result.success()
    }
    val upload = try {
      attempt(bottle, payload)
    } catch (failure: SyncFailure) {
      answer(payload.requestId, false, failure.message.orEmpty())
      return Result.success()
    }
    answer(payload.requestId, upload.outcome == "ok", if (upload.outcome == "ok") "Done." else upload.detail ?: "The bottle did not finish the request.")
    return Result.success()
  }

  private suspend fun attempt(bottle: PhoneBottle, payload: BottleActionPayload): SyncUpload {
    val context = applicationContext
    if (!LarqPermissions.connectAllowed(context) || !LarqPermissions.scanAllowed(context)) {
      throw expo.modules.healthconnect.LarqScanNotAllowed()
    }
    val address = LarqFinder.find(context, bottle.serial, LarqLimits.SCAN_MS)
    val upload = if (address == null) {
      LarqRunner.asleep("action", Instant.now()).also { LarqSync.keep(context, bottle.deviceId, it) }
    } else {
      LarqSync.run(context, bottle, address, "action", payload.plan)
    }
    try {
      LarqSync.drain(context)
    } catch (ignored: SyncFailure) {
      LarqSync.enqueueUpload(context)
    }
    return upload
  }

  private fun answer(requestId: String, ok: Boolean, detail: String) {
    val body = HubJson.encode(ActionAnswer(requestId, ok, detail))
    WorkManager.getInstance(applicationContext).enqueue(PhonePostWorker.requestText(LarqSync.ANSWER_PATH, body))
  }

  override suspend fun getForegroundInfo(): ForegroundInfo = RelayNotification.forPhone(applicationContext)

  companion object {
    const val PAYLOAD = "payload"
  }
}
