package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.RelayNotification
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import java.util.concurrent.TimeUnit
import org.json.JSONException
import org.json.JSONObject

class PhonePostWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val path = inputData.getString(PATH) ?: return failed("the work carried no path")
    val body = inputData.getString(BODY) ?: return failed("the work for $path carried no body")
    return try {
      val client = HubClient(relayTarget(applicationContext))
      if (inputData.getString(METHOD) == PUT) {
        client.put(path, JSONObject(body))
      } else {
        client.post(path, JSONObject(body))
      }
      Result.success()
    } catch (failure: IngestUnavailable) {
      PhoneEvents.emit("post_retrying", "$path: ${failure.message.orEmpty()}")
      Result.retry()
    } catch (failure: SyncFailure) {
      if (path == REPORT_PATH) {
        PhoneStore(applicationContext).setSent(JSONObject())
      }
      failed("$path: ${failure.message.orEmpty()}")
    } catch (failure: JSONException) {
      failed("$path: the queued body is not JSON: ${failure.message.orEmpty()}")
    }
  }

  override suspend fun getForegroundInfo(): ForegroundInfo =
    RelayNotification.forPhone(applicationContext)

  private fun failed(detail: String): Result {
    PhoneEvents.emit("post_failed", detail)
    return Result.failure()
  }

  companion object {
    const val REPORT_PATH = "../nodes/self/report"
    const val ANSWER_PATH = "../phones/actions/answer"
    const val PUSH_TARGET_PATH = "../push-targets"
    const val WATCH_ANSWER_PATH = "../watches/action-results"
    private const val PATH = "path"
    private const val METHOD = "method"
    private const val PUT = "PUT"
    private const val BODY = "body"
    private const val BACKOFF_SECONDS = 30L

    fun request(path: String, body: JSONObject): OneTimeWorkRequest = build(workDataOf(PATH to path, BODY to body.toString()))

    fun replace(path: String, body: JSONObject): OneTimeWorkRequest =
      build(workDataOf(PATH to path, BODY to body.toString(), METHOD to PUT))

    private fun build(data: Data): OneTimeWorkRequest = OneTimeWorkRequestBuilder<PhonePostWorker>()
      .setInputData(data)
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
      .build()
  }
}
