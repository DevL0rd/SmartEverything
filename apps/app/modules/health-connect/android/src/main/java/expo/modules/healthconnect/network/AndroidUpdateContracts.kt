package expo.modules.healthconnect.network

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import kotlinx.coroutines.Job
import okhttp3.Call

internal class AndroidUpdatePermissionContract : AppContextActivityResultContract<String, Unit> {
  override fun createIntent(context: Context, input: String): Intent =
    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.fromParts("package", input, null))

  override fun parseResult(input: String, resultCode: Int, intent: Intent?) = Unit
}

internal enum class AndroidUpdateStage(val wire: String) {
  DOWNLOADING("downloading"),
  VERIFYING("verifying"),
  WAITING_FOR_ANDROID("waiting_for_android"),
}

internal class AndroidUpdateProgress(
  private val id: String,
  private val total: Long,
  private val emit: (Map<String, Any>) -> Unit,
) {
  private var stage: AndroidUpdateStage? = null
  private var percent = -1L

  fun report(next: AndroidUpdateStage, received: Long) {
    val current = received * PERCENT / total
    if (next == stage && current == percent) return
    stage = next
    percent = current
    emit(mapOf("id" to id, "stage" to next.wire, "received" to received, "total" to total))
  }

  private companion object {
    const val PERCENT = 100L
  }
}

internal data class AndroidUpdateOutcome(val result: String, val status: Int? = null, val message: String? = null) {
  fun toMap(): Map<String, Any?> =
    if (result == FAILED) mapOf("result" to result, "status" to status, "message" to message) else mapOf("result" to result)

  companion object {
    const val FAILED = "failed"
    val INSTALLED = AndroidUpdateOutcome("installed")
    val CANCELLED = AndroidUpdateOutcome("cancelled")
  }
}

internal class AndroidUpdateRun(val id: String, private val job: Job) {
  @Volatile var cancelled = false
    private set
  @Volatile var call: Call? = null

  fun cancel() {
    cancelled = true
    call?.cancel()
    job.cancel()
  }
}
