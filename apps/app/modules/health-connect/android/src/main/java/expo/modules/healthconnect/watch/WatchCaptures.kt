package expo.modules.healthconnect.watch

import android.content.Context
import android.util.Base64
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.relayTarget
import java.time.Instant
import kotlinx.serialization.Serializable

enum class CaptureOutcome(val wire: String) {
  READ("read"),
  STAGES_UNDECODED("stages_undecoded"),
  UNREADABLE("unreadable"),
  UNSUPPORTED("unsupported"),
  IMPLAUSIBLE("implausible")
}

class WatchCapture(
  val key: String,
  val family: String,
  val type: Int,
  val subtype: Int,
  val detail: Int,
  val version: Int,
  val watchTime: Instant,
  val outcome: CaptureOutcome,
  val note: String?,
  val bytes: ByteArray
)

@Serializable
class CaptureFileWire(
  val fileId: String,
  val family: String,
  val type: Int,
  val subtype: Int,
  val detail: Int,
  val version: Int,
  val watchTime: String,
  val outcome: String,
  val note: String?,
  val bytes: String
)

@Serializable
class CaptureUploadWire(val deviceId: String, val files: List<CaptureFileWire>)

@Serializable
class CaptureSavedWire(val stored: List<String>, val duplicates: List<String>)

object WatchCaptureUpload {
  private const val SCOPE = "watch-capture"
  private const val PATH = "/api/developer/watch-captures"
  private const val BATCH_BYTES = 4 * 1024 * 1024

  suspend fun upload(context: Context, deviceId: String, captures: List<WatchCapture>): String {
    val hub = HubClient(relayTarget(context))
    val answers = batches(captures).map { batch ->
      hub.post<CaptureUploadWire, CaptureSavedWire>(PATH, CaptureUploadWire(deviceId, batch.map { wire(it) }))
    }
    val stored = answers.sumOf { it.stored.size }
    val duplicates = answers.sumOf { it.duplicates.size }
    NativeLog.info(SCOPE, "captures.uploaded") { mapOf("device" to deviceId, "files" to captures.size, "stored" to stored, "duplicates" to duplicates) }
    return "raw files saved for developers: $stored new, $duplicates already kept"
  }

  fun batches(captures: List<WatchCapture>): List<List<WatchCapture>> {
    val batches = mutableListOf<MutableList<WatchCapture>>()
    var size = 0
    captures.forEach { capture ->
      val last = batches.lastOrNull()
      if (last == null || size + capture.bytes.size > BATCH_BYTES) {
        batches.add(mutableListOf(capture))
        size = capture.bytes.size
      } else {
        last.add(capture)
        size += capture.bytes.size
      }
    }
    return batches
  }

  private fun wire(capture: WatchCapture) = CaptureFileWire(
    fileId = capture.key,
    family = capture.family,
    type = capture.type,
    subtype = capture.subtype,
    detail = capture.detail,
    version = capture.version,
    watchTime = capture.watchTime.toString(),
    outcome = capture.outcome.wire,
    note = capture.note,
    bytes = Base64.encodeToString(capture.bytes, Base64.NO_WRAP)
  )
}
