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
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import org.json.JSONArray
import org.json.JSONObject

class OutboxReading(json: JSONObject) {
  val id: String = json.getString("id")
  val version: Long = json.getLong("version")
  val measuredAt: Instant = Instant.parse(json.getString("measuredAt"))
  val weightKg: Double = json.getDouble("weightKg")
  val bodyFatPercent: Double? = json.optionalDouble("bodyFatPercent")
  val basalMetabolicRateKcal: Double? = json.optionalDouble("basalMetabolicRateKcal")
  val leanMassKg: Double? = json.optionalDouble("leanMassKg")
  val boneMassKg: Double? = json.optionalDouble("boneMassKg")
  val waterMassKg: Double? = json.optionalDouble("waterMassKg")
  val heartRate: Long? = if (json.isNull("heartRate")) null else json.getLong("heartRate")
  val heightMeters: Double? = json.optionalDouble("heightMeters")
}

private fun JSONObject.optionalDouble(name: String): Double? = if (isNull(name)) null else getDouble(name)

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
    val readings = hub.get(OUTBOX_PATH).getJSONArray("readings")
    if (!granted(client)) {
      return WriteReport(0, readings.length(), true)
    }
    val written = JSONArray()
    for (index in 0 until readings.length()) {
      val reading = OutboxReading(readings.getJSONObject(index))
      HealthConnectAccess.call { client.insertRecords(recordsOf(reading)) }
      written.put(jsonOf("id" to reading.id, "version" to reading.version))
    }
    if (written.length() > 0) {
      hub.post(OUTBOX_PATH, jsonOf("written" to written))
    }
    return WriteReport(written.length(), 0, false)
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

  private const val OUTBOX_PATH = "outbox"
}
