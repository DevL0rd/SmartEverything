@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect

import java.time.Instant
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers

@Serializable
enum class SyncTrigger(val label: String) {
  @SerialName("manual") MANUAL("manual"),
  @SerialName("scheduled") SCHEDULED("scheduled")
}

@Serializable
enum class SyncOutcome(val label: String) {
  @SerialName("succeeded") SUCCEEDED("succeeded"),
  @SerialName("failed") FAILED("failed"),
  @SerialName("retrying") RETRYING("retrying")
}

enum class SyncPhase(val label: String) {
  BACKFILL("backfill"),
  CHANGES("changes"),
  RECOVERY("recovery")
}

@Serializable
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
}
