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
import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.EntryTiming
import expo.modules.healthconnect.HealthConnectAccess
import java.time.Instant
import kotlin.reflect.KClass
import org.json.JSONObject

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

  suspend fun write(context: Context, records: List<JSONObject>): WatchWriteReport {
    if (!Credentials(context).configured()) {
      return WatchWriteReport(0, emptyList(), "Health Connect is not set up on this phone")
    }
    val client = HealthConnectAccess.client(context)
    val granted = HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
    val allowed = TYPES.filterValues { HealthPermission.getWritePermission(it) in granted }.keys
    val wanted = records.filter { it.getString("type") in allowed }
    wanted.chunked(BATCH).forEach { batch ->
      HealthConnectAccess.call { client.insertRecords(batch.map { recordOf(it) }) }
    }
    val missing = records.map { it.getString("type") }.distinct().filter { it !in allowed }
    return WatchWriteReport(wanted.size, missing, null)
  }

  suspend fun granted(client: HealthConnectClient): Boolean =
    HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }.containsAll(writePermissions)

  private fun recordOf(json: JSONObject): Record {
    val type = json.getString("type")
    val t = EntryTiming(json)
    val d = json.getJSONObject("data")
    val m = Metadata.autoRecorded(
      device = Device(type = Device.TYPE_WATCH),
      clientRecordId = "se-${json.getString("recordId")}",
      clientRecordVersion = Instant.parse(json.getString("lastModified")).toEpochMilli()
    )
    return when (type) {
      "Steps" -> StepsRecord(t.start, t.zone, t.requireEnd(type), t.zone, d.getLong("count"), m)
      "Distance" -> DistanceRecord(t.start, t.zone, t.requireEnd(type), t.zone, Length.meters(d.getDouble("meters")), m)
      "ActiveCaloriesBurned" ->
        ActiveCaloriesBurnedRecord(t.start, t.zone, t.requireEnd(type), t.zone, Energy.kilocalories(d.getDouble("kilocalories")), m)
      "HeartRate" -> HeartRateRecord(t.start, t.zone, t.requireEnd(type), t.zone, heartSamples(d), m)
      "OxygenSaturation" -> OxygenSaturationRecord(t.start, t.zone, Percentage(d.getDouble("percent")), m)
      "RestingHeartRate" -> RestingHeartRateRecord(t.start, t.zone, d.getLong("bpm"), m)
      "SleepSession" -> SleepSessionRecord(
        startTime = t.start,
        startZoneOffset = t.zone,
        endTime = t.requireEnd(type),
        endZoneOffset = t.zone,
        metadata = m,
        stages = sleepStages(d)
      )
      else -> ExerciseSessionRecord(
        startTime = t.start,
        startZoneOffset = t.zone,
        endTime = t.requireEnd(type),
        endZoneOffset = t.zone,
        metadata = m,
        exerciseType = d.getInt("exerciseType"),
        title = if (d.isNull("title")) null else d.getString("title")
      )
    }
  }

  private fun heartSamples(d: JSONObject): List<HeartRateRecord.Sample> {
    val array = d.getJSONArray("samples")
    return (0 until array.length()).map {
      val sample = array.getJSONObject(it)
      HeartRateRecord.Sample(Instant.parse(sample.getString("time")), sample.getLong("bpm"))
    }
  }

  private fun sleepStages(d: JSONObject): List<SleepSessionRecord.Stage> {
    val array = d.getJSONArray("stages")
    return (0 until array.length()).map {
      val stage = array.getJSONObject(it)
      SleepSessionRecord.Stage(
        Instant.parse(stage.getString("startTime")),
        Instant.parse(stage.getString("endTime")),
        stage.getInt("stage")
      )
    }
  }

  private const val BATCH = 200
}
