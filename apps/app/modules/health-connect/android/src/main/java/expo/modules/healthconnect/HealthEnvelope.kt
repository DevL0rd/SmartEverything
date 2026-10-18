@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect

import java.time.Instant
import java.time.ZoneOffset
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.json.JsonObject

@Serializable
class HealthEnvelope(
  val recordId: String,
  val type: String,
  val startTime: Instant,
  val endTime: Instant?,
  val zoneOffsetSeconds: Int?,
  val sourceApp: String,
  val lastModified: Instant,
  val data: JsonObject
) {
  val zone: ZoneOffset? get() = zoneOffsetSeconds?.let(ZoneOffset::ofTotalSeconds)

  fun requireEnd(): Instant = endTime ?: throw UnmappedValue("$type without an end time", startTime)
}
