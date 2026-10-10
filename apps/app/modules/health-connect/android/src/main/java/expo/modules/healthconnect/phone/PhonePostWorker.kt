package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import java.util.concurrent.TimeUnit
import org.json.JSONObject

class PhonePostWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val path = inputData.getString(PATH) ?: return failed("the work carried no path")
    val body = inputData.getString(BODY) ?: return failed("the work for $path carried no body")
    return try {
      HubClient(relayTarget(applicationContext)).post(path, JSONObject(body))
      Result.success()
    } catch (failure: IngestUnavailable) {
      PhoneEvents.emit("post_retrying", "$path: ${failure.message.orEmpty()}")
      Result.retry()
    } catch (failure: SyncFailure) {
      if (path == REPORT_PATH) {
        PhoneStore(applicationContext).setSent(JSONObject())
      }
      failed("$path: ${failure.message.orEmpty()}")
    }
  }

  private fun failed(detail: String): Result {
    PhoneEvents.emit("post_failed", detail)
    return Result.failure()
  }

  companion object {
    const val REPORT_PATH = "../nodes/self/report"
    const val ANSWER_PATH = "../phones/actions/answer"
    private const val PATH = "path"
    private const val BODY = "body"
    private const val BACKOFF_SECONDS = 30L

    fun request(path: String, body: JSONObject): OneTimeWorkRequest = OneTimeWorkRequestBuilder<PhonePostWorker>()
      .setInputData(workDataOf(PATH to path, BODY to body.toString()))
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
      .build()
  }
}
