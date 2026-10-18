package expo.modules.healthconnect

import androidx.health.connect.client.records.Record
import java.time.Instant
import kotlinx.serialization.json.JsonObject

fun moment(instant: Instant): String = instant.toString()

object RecordJson {
  fun describe(type: RecordType, record: Record): HealthEnvelope {
    val timing = RecordTiming.of(record)
    return HealthEnvelope(
      recordId = record.metadata.id,
      type = type.name,
      startTime = timing.start,
      endTime = timing.end,
      zoneOffsetSeconds = timing.zoneOffset?.totalSeconds,
      sourceApp = record.metadata.dataOrigin.packageName,
      lastModified = record.metadata.lastModifiedTime,
      data = dataOf(record)
    )
  }

  fun startOf(record: Record): Instant = RecordTiming.of(record).start

  private fun dataOf(record: Record): JsonObject =
    ActivityData.describe(record)
      ?: SessionData.describe(record)
      ?: BodyData.describe(record)
      ?: throw UnmappedValue("record", record)
}
