package expo.modules.healthconnect.watch

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
import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.UnmappedValue
import expo.modules.healthconnect.double
import expo.modules.healthconnect.int
import expo.modules.healthconnect.long
import expo.modules.healthconnect.objects
import expo.modules.healthconnect.text
import expo.modules.healthconnect.textOrNull
import java.time.DateTimeException
import java.time.Instant
import kotlinx.serialization.json.JsonObject

class RecordFailure(val recordId: String, val type: String, val reason: String)

class StageTrim(val recordId: String, val changes: List<String>, val stagesRemoved: Boolean)

class BuiltRecords(val records: List<Record>, val failures: List<RecordFailure>, val trims: List<StageTrim>) {
  val withoutStages: List<String> get() = trims.filter { it.stagesRemoved }.map { it.recordId }
}

object WatchRecordBuilder {
  fun build(envelopes: List<HealthEnvelope>): BuiltRecords {
    val records = mutableListOf<Record>()
    val failures = mutableListOf<RecordFailure>()
    val trims = mutableListOf<StageTrim>()
    envelopes.forEach { envelope ->
      try {
        records.add(recordOf(envelope) { trims.add(it) })
      } catch (invalid: IllegalArgumentException) {
        failures.add(failure(envelope, invalid))
      } catch (invalid: DateTimeException) {
        failures.add(failure(envelope, invalid))
      } catch (invalid: UnmappedValue) {
        failures.add(failure(envelope, invalid))
      }
    }
    return BuiltRecords(records, failures, trims)
  }

  private fun failure(envelope: HealthEnvelope, cause: Exception): RecordFailure =
    RecordFailure(envelope.recordId, envelope.type, "${cause.javaClass.simpleName}: ${cause.message}")

  private fun recordOf(envelope: HealthEnvelope, trimmed: (StageTrim) -> Unit): Record {
    val t = envelope
    val d = envelope.data
    val m = Metadata.autoRecorded(
      device = Device(type = Device.TYPE_WATCH),
      clientRecordId = "${WatchHealthWriter.CLIENT_ID_PREFIX}${envelope.recordId}",
      clientRecordVersion = envelope.lastModified.toEpochMilli()
    )
    return when (envelope.type) {
      "Steps" -> StepsRecord(t.startTime, t.zone, t.requireEnd(), t.zone, d.long("count"), m)
      "Distance" -> DistanceRecord(t.startTime, t.zone, t.requireEnd(), t.zone, Length.meters(d.double("meters")), m)
      "ActiveCaloriesBurned" ->
        ActiveCaloriesBurnedRecord(t.startTime, t.zone, t.requireEnd(), t.zone, Energy.kilocalories(d.double("kilocalories")), m)
      "HeartRate" -> HeartRateRecord(t.startTime, t.zone, t.requireEnd(), t.zone, heartSamples(d), m)
      "OxygenSaturation" -> OxygenSaturationRecord(t.startTime, t.zone, Percentage(d.double("percent")), m)
      "RestingHeartRate" -> RestingHeartRateRecord(t.startTime, t.zone, d.long("bpm"), m)
      "SleepSession" -> sleep(t, m, trimmed)
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

  private fun sleep(t: HealthEnvelope, m: Metadata, trimmed: (StageTrim) -> Unit): SleepSessionRecord {
    val end = t.requireEnd()
    require(t.startTime.isBefore(end)) { "the night starts at ${t.startTime}, not before its end $end" }
    val fit = SleepStageWindow.fit(t.startTime, end, sleepStages(t.data))
    if (fit.changed.isNotEmpty()) trimmed(StageTrim(t.recordId, fit.changed, fit.removedAll))
    return SleepSessionRecord(
      startTime = t.startTime,
      startZoneOffset = t.zone,
      endTime = end,
      endZoneOffset = t.zone,
      metadata = m,
      stages = fit.kept.map { SleepSessionRecord.Stage(it.start, it.end, it.stage) }
    )
  }

  private fun heartSamples(d: JsonObject): List<HeartRateRecord.Sample> =
    d.objects("samples").map { HeartRateRecord.Sample(Instant.parse(it.text("time")), it.long("bpm")) }

  private fun sleepStages(d: JsonObject): List<SleepStage> =
    d.objects("stages").map { SleepStage(Instant.parse(it.text("startTime")), Instant.parse(it.text("endTime")), it.int("stage")) }
}
