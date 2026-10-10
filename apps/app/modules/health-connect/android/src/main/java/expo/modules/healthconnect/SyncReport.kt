package expo.modules.healthconnect

import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

enum class SyncTrigger(val label: String) {
  MANUAL("manual"),
  SCHEDULED("scheduled")
}

enum class SyncOutcome(val label: String) {
  SUCCEEDED("succeeded"),
  FAILED("failed"),
  RETRYING("retrying")
}

enum class SyncPhase(val label: String) {
  BACKFILL("backfill"),
  CHANGES("changes"),
  RECOVERY("recovery")
}

class SyncReport(
  val trigger: SyncTrigger,
  val startedAt: Instant,
  val finishedAt: Instant,
  val outcome: SyncOutcome,
  val records: Int,
  val deletions: Int,
  val types: List<String>,
  val error: String?
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "trigger" to trigger.label,
    "startedAt" to startedAt.toString(),
    "finishedAt" to finishedAt.toString(),
    "outcome" to outcome.label,
    "records" to records,
    "deletions" to deletions,
    "types" to types,
    "error" to error
  )

  fun toJson(): JSONObject = jsonOf(
    "trigger" to trigger.label,
    "startedAt" to startedAt.toString(),
    "finishedAt" to finishedAt.toString(),
    "outcome" to outcome.label,
    "records" to records,
    "deletions" to deletions,
    "types" to JSONArray(types),
    "error" to error
  )

  companion object {
    fun fromJson(json: JSONObject): SyncReport {
      val types = json.getJSONArray("types")
      return SyncReport(
        trigger = SyncTrigger.entries.first { it.label == json.getString("trigger") },
        startedAt = Instant.parse(json.getString("startedAt")),
        finishedAt = Instant.parse(json.getString("finishedAt")),
        outcome = SyncOutcome.entries.first { it.label == json.getString("outcome") },
        records = json.getInt("records"),
        deletions = json.getInt("deletions"),
        types = List(types.length()) { types.getString(it) },
        error = if (json.isNull("error")) null else json.getString("error")
      )
    }
  }
}
