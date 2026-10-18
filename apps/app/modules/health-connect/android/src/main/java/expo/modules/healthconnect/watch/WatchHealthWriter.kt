package expo.modules.healthconnect.watch

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Percentage
import expo.modules.healthconnect.HealthConnectAccess
import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.double
import expo.modules.healthconnect.int
import expo.modules.healthconnect.long
import expo.modules.healthconnect.objects
import expo.modules.healthconnect.text
import expo.modules.healthconnect.textOrNull
import java.time.Instant
import kotlin.reflect.KClass
import kotlinx.serialization.json.JsonObject

class WatchWriteReport(val written: Int, val missing: List<String>, val skipped: String?)

object WatchHealthWriter {
  private val TYPES: Map<String, KClass<out Record>> = mapOf(
    "Steps" to StepsRecord::class,
    "Distance" to DistanceRecord::class,
    "ActiveCaloriesBurned" to ActiveCaloriesBurnedRecord::class,
    "HeartRate" to HeartRateRecord::class,
    "OxygenSaturation" to OxygenSaturationRecord::class,
    "RestingHeartRate" to RestingHeartRateRecord::class,
    "SleepSession" to SleepSessionRecord::class,
    "ExerciseSession" to ExerciseSessionRecord::class
  )

  val writePermissions: Set<String> = TYPES.values.map { HealthPermission.getWritePermission(it) }.toSet()

  suspend fun write(context: Context, records: List<HealthEnvelope>): WatchWriteReport {
    if (!HealthConnectAccess.connected(context)) {
      return WatchWriteReport(0, emptyList(), "Health Connect is not set up on this phone")
    }
    val client = HealthConnectAccess.client(context)
    val granted = HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
    val allowed = TYPES.filterValues { HealthPermission.getWritePermission(it) in granted }.keys
    val wanted = records.filter { it.type in allowed }
    wanted.chunked(BATCH).forEach { batch ->
      HealthConnectAccess.call { client.insertRecords(batch.map { recordOf(it) }) }
    }
    val missing = records.map { it.type }.distinct().filter { it !in allowed }
    return WatchWriteReport(wanted.size, missing, null)
  }

  suspend fun granted(client: HealthConnectClient): Boolean =
    HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }.containsAll(writePermissions)

  private fun recordOf(envelope: HealthEnvelope): Record {
    val type = envelope.type
    val t = envelope
    val d = envelope.data
    val m = Metadata.autoRecorded(
      device = Device(type = Device.TYPE_WATCH),
      clientRecordId = "se-${envelope.recordId}",
      clientRecordVersion = envelope.lastModified.toEpochMilli()
    )
    return when (type) {
      "Steps" -> StepsRecord(t.startTime, t.zone, t.requireEnd(), t.zone, d.long("count"), m)
      "Distance" -> DistanceRecord(t.startTime, t.zone, t.requireEnd(), t.zone, Length.meters(d.double("meters")), m)
      "ActiveCaloriesBurned" ->
        ActiveCaloriesBurnedRecord(t.startTime, t.zone, t.requireEnd(), t.zone, Energy.kilocalories(d.double("kilocalories")), m)
      "HeartRate" -> HeartRateRecord(t.startTime, t.zone, t.requireEnd(), t.zone, heartSamples(d), m)
      "OxygenSaturation" -> OxygenSaturationRecord(t.startTime, t.zone, Percentage(d.double("percent")), m)
      "RestingHeartRate" -> RestingHeartRateRecord(t.startTime, t.zone, d.long("bpm"), m)
      "SleepSession" -> SleepSessionRecord(
        startTime = t.startTime,
        startZoneOffset = t.zone,
        endTime = t.requireEnd(),
        endZoneOffset = t.zone,
        metadata = m,
        stages = sleepStages(d)
      )
      else -> ExerciseSessionRecord(
        startTime = t.startTime,
        startZoneOffset = t.zone,
        endTime = t.requireEnd(),
        endZoneOffset = t.zone,
        metadata = m,
        exerciseType = d.int("exerciseType"),
        title = d.textOrNull("title")
      )
    }
  }

  private fun heartSamples(d: JsonObject): List<HeartRateRecord.Sample> =
    d.objects("samples").map { HeartRateRecord.Sample(Instant.parse(it.text("time")), it.long("bpm")) }

  private fun sleepStages(d: JsonObject): List<SleepSessionRecord.Stage> =
    d.objects("stages").map {
      SleepSessionRecord.Stage(Instant.parse(it.text("startTime")), Instant.parse(it.text("endTime")), it.int("stage"))
    }

  private const val BATCH = 200
}
