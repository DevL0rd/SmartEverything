package expo.modules.healthconnect.phone

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
import expo.modules.healthconnect.RelayNotification
import expo.modules.healthconnect.push.PhoneActionOrigin
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class PhoneFileWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val requestId = inputData.getString(REQUEST) ?: return Result.failure()
    val action = JSONObject(inputData.getString(ACTION).orEmpty())
    val origin = PhoneActionOrigin(inputData.getString(SOURCE).orEmpty(), inputData.getString(CLIENT))
    val result = withContext(Dispatchers.IO) { PhoneActionPush.runSafely(applicationContext, action, origin) }
    PhoneActionPush.answer(applicationContext, requestId, result)
    return Result.success()
  }

  override suspend fun getForegroundInfo(): ForegroundInfo = RelayNotification.forPhone(applicationContext)

  companion object {
    private const val REQUEST = "requestId"
    private const val ACTION = "action"
    private const val SOURCE = "source"
    private const val CLIENT = "client"

    fun enqueue(context: Context, requestId: String, action: JSONObject, origin: PhoneActionOrigin) {
      val request = OneTimeWorkRequestBuilder<PhoneFileWorker>()
        .setInputData(workDataOf(REQUEST to requestId, ACTION to action.toString(), SOURCE to origin.source, CLIENT to origin.client))
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork("phone-file:$requestId", ExistingWorkPolicy.KEEP, request)
    }
  }
}
