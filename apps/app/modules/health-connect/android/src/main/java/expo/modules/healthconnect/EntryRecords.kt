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
import kotlinx.serialization.json.JsonObject

object EntryRecords {
  fun of(envelope: HealthEnvelope, metadata: Metadata): Record {
    val data = envelope.data
    return measure(envelope, data, metadata)
      ?: vital(envelope, data, metadata)
      ?: session(envelope, data, metadata)
      ?: cycle(envelope, data, metadata)
      ?: NutritionEntry.of(envelope, data, metadata)
      ?: throw UnmappedValue("loggable record type", envelope.type)
  }

  private fun measure(t: HealthEnvelope, d: JsonObject, m: Metadata): Record? = when (t.type) {
    "Weight" -> WeightRecord(t.startTime, t.zone, Mass.kilograms(d.double("kilograms")), m)
    "Height" -> HeightRecord(t.startTime, t.zone, Length.meters(d.double("meters")), m)
    "BodyFat" -> BodyFatRecord(t.startTime, t.zone, Percentage(d.double("percent")), m)
    "Hydration" -> HydrationRecord(
      startTime = t.startTime,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(),
      endZoneOffset = t.zone,
      volume = Volume.liters(d.double("liters")),
      metadata = m
    )
    else -> null
  }

  private fun vital(t: HealthEnvelope, d: JsonObject, m: Metadata): Record? = when (t.type) {
    "BloodPressure" -> BloodPressureRecord(
      time = t.startTime,
      zoneOffset = t.zone,
      metadata = m,
      systolic = Pressure.millimetersOfMercury(d.double("systolicMmHg")),
      diastolic = Pressure.millimetersOfMercury(d.double("diastolicMmHg")),
      bodyPosition = d.int("bodyPosition"),
      measurementLocation = d.int("measurementLocation")
    )
    "BloodGlucose" -> BloodGlucoseRecord(
      time = t.startTime,
      zoneOffset = t.zone,
      metadata = m,
      level = BloodGlucose.millimolesPerLiter(d.double("millimolesPerLiter")),
      specimenSource = d.int("specimenSource"),
      mealType = d.int("mealType"),
      relationToMeal = d.int("relationToMeal")
    )
    "BodyTemperature" -> BodyTemperatureRecord(
      time = t.startTime,
      zoneOffset = t.zone,
      metadata = m,
      temperature = Temperature.celsius(d.double("celsius")),
      measurementLocation = d.int("measurementLocation")
    )
    "BasalBodyTemperature" -> BasalBodyTemperatureRecord(
      time = t.startTime,
      zoneOffset = t.zone,
      metadata = m,
      temperature = Temperature.celsius(d.double("celsius")),
      measurementLocation = d.int("measurementLocation")
    )
    "OxygenSaturation" -> OxygenSaturationRecord(t.startTime, t.zone, Percentage(d.double("percent")), m)
    "RestingHeartRate" -> RestingHeartRateRecord(t.startTime, t.zone, d.long("bpm"), m)
    "RespiratoryRate" -> RespiratoryRateRecord(t.startTime, t.zone, d.double("rate"), m)
    else -> null
  }

    private fun session(t: HealthEnvelope, d: JsonObject, m: Metadata): Record? = when (t.type) {
    "ExerciseSession" -> ExerciseSessionRecord(
      startTime = t.startTime,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(),
      endZoneOffset = t.zone,
      metadata = m,
      exerciseType = d.int("exerciseType"),
      title = d.textOrNull("title"),
      notes = d.textOrNull("notes")
    )
    "SleepSession" -> SleepSessionRecord(
      startTime = t.startTime,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(),
      endZoneOffset = t.zone,
      metadata = m,
      title = d.textOrNull("title"),
      notes = d.textOrNull("notes")
    )
    "MindfulnessSession" -> MindfulnessSessionRecord(
      startTime = t.startTime,
      startZoneOffset = t.zone,
      endTime = t.requireEnd(),
      endZoneOffset = t.zone,
      metadata = m,
      mindfulnessSessionType = d.int("mindfulnessSessionType"),
      title = d.textOrNull("title"),
      notes = d.textOrNull("notes")
    )
    else -> null
  }

  private fun cycle(t: HealthEnvelope, d: JsonObject, m: Metadata): Record? = when (t.type) {
    "MenstruationFlow" -> MenstruationFlowRecord(t.startTime, t.zone, m, d.int("flow"))
    "MenstruationPeriod" -> MenstruationPeriodRecord(t.startTime, t.zone, t.requireEnd(), t.zone, m)
    "IntermenstrualBleeding" -> IntermenstrualBleedingRecord(t.startTime, t.zone, m)
    "CervicalMucus" -> CervicalMucusRecord(
      time = t.startTime,
      zoneOffset = t.zone,
      metadata = m,
      appearance = d.int("appearance"),
      sensation = d.int("sensation")
    )
    "OvulationTest" -> OvulationTestRecord(t.startTime, t.zone, d.int("result"), m)
    "SexualActivity" -> SexualActivityRecord(t.startTime, t.zone, m, d.int("protectionUsed"))
    else -> null
  }
}
