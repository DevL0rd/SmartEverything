package expo.modules.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import androidx.health.connect.client.units.Power
import java.time.ZoneId
import java.time.ZoneOffset

class WriteReport(val written: Int, val waiting: Int, val missingPermission: Boolean) {
  fun toMap(): Map<String, Any> = mapOf(
    "written" to written,
    "waiting" to waiting,
    "missingPermission" to missingPermission
  )
}

object BodyWriter {
  val writePermissions: Set<String> = setOf(
    HealthPermission.getWritePermission(WeightRecord::class),
    HealthPermission.getWritePermission(BodyFatRecord::class),
    HealthPermission.getWritePermission(BasalMetabolicRateRecord::class),
    HealthPermission.getWritePermission(LeanBodyMassRecord::class),
    HealthPermission.getWritePermission(BoneMassRecord::class),
    HealthPermission.getWritePermission(BodyWaterMassRecord::class),
    HealthPermission.getWritePermission(HeartRateRecord::class),
    HealthPermission.getWritePermission(HeightRecord::class)
  )

  suspend fun granted(client: HealthConnectClient): Boolean =
    HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
      .containsAll(writePermissions)

  suspend fun deliver(context: Context): WriteReport {
    val client = HealthConnectAccess.client(context)
    val hub = HubClient(Credentials(context).load())
    val readings = hub.get<HealthOutbox>(OUTBOX_PATH).readings
    if (!granted(client)) {
      return WriteReport(0, readings.size, true)
    }
    val written = readings.map { reading ->
      HealthConnectAccess.call { client.insertRecords(recordsOf(reading)) }
      Written(reading.id, reading.version)
    }
    if (written.isNotEmpty()) {
      hub.submit(OUTBOX_PATH, OutboxAck(written = written))
    }
    return WriteReport(written.size, 0, false)
  }

  private fun metadataOf(reading: OutboxReading, type: String): Metadata = Metadata.autoRecorded(
    device = Device(type = Device.TYPE_SCALE),
    clientRecordId = "se-scale-${reading.id}-$type",
    clientRecordVersion = reading.version
  )

  private fun recordsOf(reading: OutboxReading): List<Record> {
    val at = reading.measuredAt
    val zone: ZoneOffset = ZoneId.systemDefault().rules.getOffset(at)
    return listOfNotNull(
      WeightRecord(at, zone, Mass.kilograms(reading.weightKg), metadataOf(reading, "weight")),
      reading.bodyFatPercent?.let { BodyFatRecord(at, zone, Percentage(it), metadataOf(reading, "fat")) },
      reading.basalMetabolicRateKcal?.let {
        BasalMetabolicRateRecord(at, zone, Power.kilocaloriesPerDay(it), metadataOf(reading, "bmr"))
      },
      reading.leanMassKg?.let { LeanBodyMassRecord(at, zone, Mass.kilograms(it), metadataOf(reading, "lean")) },
      reading.boneMassKg?.let { BoneMassRecord(at, zone, Mass.kilograms(it), metadataOf(reading, "bone")) },
      reading.waterMassKg?.let { BodyWaterMassRecord(at, zone, Mass.kilograms(it), metadataOf(reading, "water")) },
      reading.heartRate?.let { heartRateOf(reading, it, zone) },
      reading.heightMeters?.let { HeightRecord(at, zone, Length.meters(it), metadataOf(reading, "height")) }
    )
  }

  private fun heartRateOf(reading: OutboxReading, bpm: Long, zone: ZoneOffset): HeartRateRecord {
    val at = reading.measuredAt
    return HeartRateRecord(
      startTime = at,
      startZoneOffset = zone,
      endTime = at.plusSeconds(1),
      endZoneOffset = zone,
      samples = listOf(HeartRateRecord.Sample(at, bpm)),
      metadata = metadataOf(reading, "heart")
    )
  }

  private const val OUTBOX_PATH = "/api/health/outbox"
}
