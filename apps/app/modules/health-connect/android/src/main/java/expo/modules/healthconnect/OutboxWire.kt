@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect

import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers

@Serializable
class OutboxReading(
  val id: String,
  val version: Long,
  val measuredAt: Instant,
  val weightKg: Double,
  val bodyFatPercent: Double?,
  val basalMetabolicRateKcal: Double?,
  val leanMassKg: Double?,
  val boneMassKg: Double?,
  val waterMassKg: Double?,
  val heartRate: Long?,
  val heightMeters: Double?
)

@Serializable
class OutboxRecord(val type: String, val clientRecordId: String, val record: HealthEnvelope?) {
  val recordType: RecordType get() = RecordTypes.named(type)
}

@Serializable
class OutboxEntry(val id: String, val version: Long, val records: List<OutboxRecord>)

@Serializable
class HealthOutbox(val readings: List<OutboxReading>, val entries: List<OutboxEntry>)

@Serializable
class Written(val id: String, val version: Long)

@Serializable
class EntryFailure(val id: String, val version: Long, val reason: String)

@Serializable
class OutboxAck(
  val written: List<Written> = emptyList(),
  val entries: List<Written> = emptyList(),
  val failed: List<EntryFailure> = emptyList(),
  val deletedInHealthConnect: List<String> = emptyList()
)
