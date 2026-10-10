@file:OptIn(ExperimentalMindfulnessSessionApi::class)

package expo.modules.healthconnect

import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.CyclingPedalingCadenceRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.IntermenstrualBleedingRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.MindfulnessSessionRecord
import androidx.health.connect.client.records.NutritionRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.PlannedExerciseSessionRecord
import androidx.health.connect.client.records.PowerRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SexualActivityRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsCadenceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.WheelchairPushesRecord
import java.time.Instant
import java.time.ZoneOffset

class Timing(val start: Instant, val end: Instant?, val zoneOffset: ZoneOffset?)

object RecordTiming {
  fun of(record: Record): Timing =
    interval(record) ?: instant(record) ?: throw UnmappedValue("record", record)

  private fun interval(record: Record): Timing? = when (record) {
    is ActiveCaloriesBurnedRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is CyclingPedalingCadenceRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is DistanceRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is ElevationGainedRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is ExerciseSessionRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is FloorsClimbedRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is HeartRateRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is HydrationRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is MenstruationPeriodRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is MindfulnessSessionRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is NutritionRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is PlannedExerciseSessionRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is PowerRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is SkinTemperatureRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is SleepSessionRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is SpeedRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is StepsRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is StepsCadenceRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is TotalCaloriesBurnedRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    is WheelchairPushesRecord -> Timing(record.startTime, record.endTime, record.startZoneOffset)
    else -> null
  }

  private fun instant(record: Record): Timing? = when (record) {
    is BasalBodyTemperatureRecord -> Timing(record.time, null, record.zoneOffset)
    is BasalMetabolicRateRecord -> Timing(record.time, null, record.zoneOffset)
    is BloodGlucoseRecord -> Timing(record.time, null, record.zoneOffset)
    is BloodPressureRecord -> Timing(record.time, null, record.zoneOffset)
    is BodyFatRecord -> Timing(record.time, null, record.zoneOffset)
    is BodyTemperatureRecord -> Timing(record.time, null, record.zoneOffset)
    is BodyWaterMassRecord -> Timing(record.time, null, record.zoneOffset)
    is BoneMassRecord -> Timing(record.time, null, record.zoneOffset)
    is CervicalMucusRecord -> Timing(record.time, null, record.zoneOffset)
    is HeartRateVariabilityRmssdRecord -> Timing(record.time, null, record.zoneOffset)
    is HeightRecord -> Timing(record.time, null, record.zoneOffset)
    is IntermenstrualBleedingRecord -> Timing(record.time, null, record.zoneOffset)
    is LeanBodyMassRecord -> Timing(record.time, null, record.zoneOffset)
    is MenstruationFlowRecord -> Timing(record.time, null, record.zoneOffset)
    is OvulationTestRecord -> Timing(record.time, null, record.zoneOffset)
    is OxygenSaturationRecord -> Timing(record.time, null, record.zoneOffset)
    is RespiratoryRateRecord -> Timing(record.time, null, record.zoneOffset)
    is RestingHeartRateRecord -> Timing(record.time, null, record.zoneOffset)
    is SexualActivityRecord -> Timing(record.time, null, record.zoneOffset)
    is Vo2MaxRecord -> Timing(record.time, null, record.zoneOffset)
    is WeightRecord -> Timing(record.time, null, record.zoneOffset)
    else -> null
  }
}
