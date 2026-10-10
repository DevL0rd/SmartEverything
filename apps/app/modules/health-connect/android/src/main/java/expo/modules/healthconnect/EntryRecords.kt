@file:OptIn(ExperimentalMindfulnessSessionApi::class)

package expo.modules.healthconnect

import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.IntermenstrualBleedingRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.MindfulnessSessionRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SexualActivityRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.BloodGlucose
import androidx.health.connect.client.units.Length
import androidx.health.connect.client.units.Mass
import androidx.health.connect.client.units.Percentage
import androidx.health.connect.client.units.Pressure
import androidx.health.connect.client.units.Temperature
import androidx.health.connect.client.units.Volume
import java.time.Instant
import java.time.ZoneOffset
import org.json.JSONObject

class EntryTiming(json: JSONObject) {
  val start: Instant = Instant.parse(json.getString("startTime"))
  val end: Instant? = if (json.isNull("endTime")) null else Instant.parse(json.getString("endTime"))
  val zone: ZoneOffset? =
    if (json.isNull("zoneOffsetSeconds")) null else ZoneOffset.ofTotalSeconds(json.getInt("zoneOffsetSeconds"))

  fun requireEnd(type: String): Instant = end ?: throw UnmappedValue("$type without an end time", start)
}

object EntryRecords {
  fun of(json: JSONObject, metadata: Metadata): Record {
    val type = json.getString("type")
    val timing = EntryTiming(json)
    val data = json.getJSONObject("data")
    return measure(type, timing, data, metadata)
      ?: vital(type, timing, data, metadata)
      ?: session(type, timing, data, metadata)
      ?: cycle(type, timing, data, metadata)
      ?: NutritionEntry.of(type, timing, data, metadata)
      ?: throw UnmappedValue("loggable record type", type)
  }

  private fun measure(type: String, t: EntryTiming, d: JSONObject, m: Metadata): Record? = when (type) {
    "Weight" -> WeightRecord(t.start, t.zone, Mass.kilograms(d.getDouble("kilograms")), m)
    "Height" -> HeightRecord(t.start, t.zone, Length.meters(d.getDouble("meters")), m)
    "BodyFat" -> BodyFatRecord(t.start, t.zone, Percentage(d.getDouble("percent")), m)
    "Hydration" -> HydrationRecord(
      startTime = t.start,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(type),
      endZoneOffset = t.zone,
      volume = Volume.liters(d.getDouble("liters")),
      metadata = m
    )
    else -> null
  }

  private fun vital(type: String, t: EntryTiming, d: JSONObject, m: Metadata): Record? = when (type) {
    "BloodPressure" -> BloodPressureRecord(
      time = t.start,
      zoneOffset = t.zone,
      metadata = m,
      systolic = Pressure.millimetersOfMercury(d.getDouble("systolicMmHg")),
      diastolic = Pressure.millimetersOfMercury(d.getDouble("diastolicMmHg")),
      bodyPosition = d.getInt("bodyPosition"),
      measurementLocation = d.getInt("measurementLocation")
    )
    "BloodGlucose" -> BloodGlucoseRecord(
      time = t.start,
      zoneOffset = t.zone,
      metadata = m,
      level = BloodGlucose.millimolesPerLiter(d.getDouble("millimolesPerLiter")),
      specimenSource = d.getInt("specimenSource"),
      mealType = d.getInt("mealType"),
      relationToMeal = d.getInt("relationToMeal")
    )
    "BodyTemperature" -> BodyTemperatureRecord(
      time = t.start,
      zoneOffset = t.zone,
      metadata = m,
      temperature = Temperature.celsius(d.getDouble("celsius")),
      measurementLocation = d.getInt("measurementLocation")
    )
    "BasalBodyTemperature" -> BasalBodyTemperatureRecord(
      time = t.start,
      zoneOffset = t.zone,
      metadata = m,
      temperature = Temperature.celsius(d.getDouble("celsius")),
      measurementLocation = d.getInt("measurementLocation")
    )
    "OxygenSaturation" -> OxygenSaturationRecord(t.start, t.zone, Percentage(d.getDouble("percent")), m)
    "RestingHeartRate" -> RestingHeartRateRecord(t.start, t.zone, d.getLong("bpm"), m)
    "RespiratoryRate" -> RespiratoryRateRecord(t.start, t.zone, d.getDouble("rate"), m)
    else -> null
  }

  private fun text(d: JSONObject, name: String): String? = if (d.isNull(name)) null else d.getString(name)

  private fun session(type: String, t: EntryTiming, d: JSONObject, m: Metadata): Record? = when (type) {
    "ExerciseSession" -> ExerciseSessionRecord(
      startTime = t.start,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(type),
      endZoneOffset = t.zone,
      metadata = m,
      exerciseType = d.getInt("exerciseType"),
      title = text(d, "title"),
      notes = text(d, "notes")
    )
    "SleepSession" -> SleepSessionRecord(
      startTime = t.start,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(type),
      endZoneOffset = t.zone,
      metadata = m,
      title = text(d, "title"),
      notes = text(d, "notes")
    )
    "MindfulnessSession" -> MindfulnessSessionRecord(
      startTime = t.start,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(type),
      endZoneOffset = t.zone,
      metadata = m,
      mindfulnessSessionType = d.getInt("mindfulnessSessionType"),
      title = text(d, "title"),
      notes = text(d, "notes")
    )
    else -> null
  }

  private fun cycle(type: String, t: EntryTiming, d: JSONObject, m: Metadata): Record? = when (type) {
    "MenstruationFlow" -> MenstruationFlowRecord(t.start, t.zone, m, d.getInt("flow"))
    "MenstruationPeriod" -> MenstruationPeriodRecord(t.start, t.zone, t.requireEnd(type), t.zone, m)
    "IntermenstrualBleeding" -> IntermenstrualBleedingRecord(t.start, t.zone, m)
    "CervicalMucus" -> CervicalMucusRecord(
      time = t.start,
      zoneOffset = t.zone,
      metadata = m,
      appearance = d.getInt("appearance"),
      sensation = d.getInt("sensation")
    )
    "OvulationTest" -> OvulationTestRecord(t.start, t.zone, d.getInt("result"), m)
    "SexualActivity" -> SexualActivityRecord(t.start, t.zone, m, d.getInt("protectionUsed"))
    else -> null
  }
}
