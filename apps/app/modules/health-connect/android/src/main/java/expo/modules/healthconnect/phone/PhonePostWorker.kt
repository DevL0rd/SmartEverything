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
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.IngestUnavailable
import expo.modules.healthconnect.RelayNotification
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import java.util.concurrent.TimeUnit
import kotlinx.serialization.SerializationException
import org.json.JSONObject

class PhonePostWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val result = deliver()
    if (result != Result.retry()) {
      inputData.getString(BODY_FILE)?.let { PhoneBodyFiles.delete(applicationContext, it) }
      inputData.getString(ICON_HASH)?.let { settleIcon(it, result == Result.success()) }
    }
    return result
  }

  private suspend fun deliver(): Result {
    val path = inputData.getString(PATH) ?: return failed("the work carried no path")
    val body = inputData.getString(BODY)
      ?: inputData.getString(BODY_FILE)?.let { PhoneBodyFiles.read(applicationContext, it) }
      ?: return failed("the work for $path carried no body")
    return try {
      HubClient(relayTarget(applicationContext)).submit(path, HubJson.parseObject(body), inputData.getString(METHOD) == PUT)
      Result.success()
    } catch (failure: IngestUnavailable) {
      PhoneEvents.emit("post_retrying", "$path: ${failure.message.orEmpty()}")
      Result.retry()
    } catch (failure: SyncFailure) {
      if (path == REPORT_PATH) {
        PhoneStore(applicationContext).forgetSent()
      }
      failed("$path: ${failure.message.orEmpty()}")
    } catch (failure: SerializationException) {
      failed("$path: the queued body is not JSON: ${failure.message.orEmpty()}")
    }
  }

  private fun settleIcon(hash: String, delivered: Boolean) {
    if (delivered) PhoneIcons.uploaded(applicationContext, hash) else PhoneIcons.rejected(applicationContext, hash)
  }

  override suspend fun getForegroundInfo(): ForegroundInfo =
    RelayNotification.forPhone(applicationContext)

  private fun failed(detail: String): Result {
    PhoneEvents.emit("post_failed", detail)
    return Result.failure()
  }

  companion object {
    const val REPORT_PATH = "/api/nodes/self/report"
    const val ANSWER_PATH = "/api/phones/actions/answer"
    const val PUSH_TARGET_PATH = "/api/push-targets"
    const val WATCH_ANSWER_PATH = "/api/watches/action-results"
    private const val PATH = "path"
    private const val METHOD = "method"
    private const val PUT = "PUT"
    private const val BODY = "body"
    private const val BODY_FILE = "bodyFile"
    private const val ICON_HASH = "iconHash"
    const val BODY_FILE_TAG = "phone-post-file"
    private const val BODY_FILE_TAG_PREFIX = "$BODY_FILE_TAG:"
    private const val INLINE_BYTES = 9000
    private const val BACKOFF_SECONDS = 30L

    fun request(path: String, body: JSONObject): OneTimeWorkRequest = requestText(path, body.toString())

    fun requestText(path: String, body: String): OneTimeWorkRequest = build(workDataOf(PATH to path, BODY to body))

    fun reportRequest(context: Context, body: JSONObject): OneTimeWorkRequest = sizedRequest(context, REPORT_PATH, body.toString())

    fun sizedRequest(context: Context, path: String, text: String): OneTimeWorkRequest {
      if (text.toByteArray().size <= INLINE_BYTES) {
        return requestText(path, text)
      }
      val file = PhoneBodyFiles.write(context, text)
      return build(workDataOf(PATH to path, BODY_FILE to file), listOf(BODY_FILE_TAG, BODY_FILE_TAG_PREFIX + file))
    }

    fun fileOfTag(tag: String): String? = tag.takeIf { it.startsWith(BODY_FILE_TAG_PREFIX) }?.removePrefix(BODY_FILE_TAG_PREFIX)

    fun iconRequest(hash: String, path: String, body: JSONObject): OneTimeWorkRequest =
      build(workDataOf(PATH to path, BODY to body.toString(), ICON_HASH to hash))

    fun replace(path: String, body: JSONObject): OneTimeWorkRequest =
      build(workDataOf(PATH to path, BODY to body.toString(), METHOD to PUT))

    private fun build(data: Data, tags: List<String> = emptyList()): OneTimeWorkRequest = OneTimeWorkRequestBuilder<PhonePostWorker>()
      .setInputData(data)
      .also { builder -> tags.forEach(builder::addTag) }
      .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
      .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
      .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
      .build()
  }
}
