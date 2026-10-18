package expo.modules.healthconnect.listening

import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant
import java.util.Base64
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import org.json.JSONObject

class HubReports(target: IngestTarget, private val scope: CoroutineScope) {
  private val hub = HubClient(target)
  private val levelInFlight = AtomicBoolean(false)

  fun level(dbfs: Double) {
    if (levelInFlight.compareAndSet(false, true)) {
      scope.launch {
        try {
          post(levelBody(dbfs))
        } finally {
          levelInFlight.set(false)
        }
      }
    }
  }

  fun segment(segment: Segment) {
    scope.launch { post(segmentBody(segment)) }
  }

  private suspend fun post(body: JSONObject) {
    try {
      hub.submit(PATH, HubJson.parseObject(body.toString()))
    } catch (failure: SyncFailure) {
      NativeLog.warn(SCOPE, "report.failed", failure) { mapOf("kind" to body.optString("kind")) }
    }
  }

  companion object {
    const val PATH = "/api/listening/phone/reports"
    private const val SCOPE = "listening"

    fun levelBody(dbfs: Double): JSONObject = JSONObject().put("kind", "level").put("dbfs", dbfs)

    fun segmentBody(segment: Segment): JSONObject = JSONObject()
      .put("kind", "segment")
      .put(
        "segment",
        JSONObject()
          .put("at", Instant.ofEpochMilli(segment.startedAtMs).toString())
          .put("endedAt", Instant.ofEpochMilli(segment.endedAtMs).toString())
          .put("levelDbfs", LevelOf.dbfs(segment.pcm))
          .put("pcm", Base64.getEncoder().encodeToString(littleEndian(segment.pcm)))
      )

    fun littleEndian(pcm: ShortArray): ByteArray {
      val bytes = ByteBuffer.allocate(pcm.size * Short.SIZE_BYTES).order(ByteOrder.LITTLE_ENDIAN)
      bytes.asShortBuffer().put(pcm)
      return bytes.array()
    }
  }
}
