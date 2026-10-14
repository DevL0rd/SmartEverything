@file:OptIn(ExperimentalMindfulnessSessionApi::class)

package expo.modules.healthconnect

import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.permission.HealthPermission
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
import kotlin.reflect.KClass

class RecordType(
  val name: String,
  val recordClass: KClass<out Record>,
  val feature: Int? = null
) {
  val readPermission: String
    get() = HealthPermission.getReadPermission(recordClass)

  val writePermission: String
    get() = HealthPermission.getWritePermission(recordClass)
}

object RecordTypes {
  val all: List<RecordType> = listOf(
    RecordType("ActiveCaloriesBurned", ActiveCaloriesBurnedRecord::class),
    RecordType("BasalBodyTemperature", BasalBodyTemperatureRecord::class),
    RecordType("BasalMetabolicRate", BasalMetabolicRateRecord::class),
    RecordType("BloodGlucose", BloodGlucoseRecord::class),
    RecordType("BloodPressure", BloodPressureRecord::class),
    RecordType("BodyFat", BodyFatRecord::class),
    RecordType("BodyTemperature", BodyTemperatureRecord::class),
    RecordType("BodyWaterMass", BodyWaterMassRecord::class),
    RecordType("BoneMass", BoneMassRecord::class),
    RecordType("CervicalMucus", CervicalMucusRecord::class),
    RecordType("CyclingPedalingCadence", CyclingPedalingCadenceRecord::class),
    RecordType("Distance", DistanceRecord::class),
    RecordType("ElevationGained", ElevationGainedRecord::class),
    RecordType("ExerciseSession", ExerciseSessionRecord::class),
    RecordType("FloorsClimbed", FloorsClimbedRecord::class),
    RecordType("HeartRate", HeartRateRecord::class),
    RecordType("HeartRateVariabilityRmssd", HeartRateVariabilityRmssdRecord::class),
    RecordType("Height", HeightRecord::class),
    RecordType("Hydration", HydrationRecord::class),
    RecordType("IntermenstrualBleeding", IntermenstrualBleedingRecord::class),
    RecordType("LeanBodyMass", LeanBodyMassRecord::class),
    RecordType("MenstruationFlow", MenstruationFlowRecord::class),
    RecordType("MenstruationPeriod", MenstruationPeriodRecord::class),
    RecordType(
      "MindfulnessSession",
      MindfulnessSessionRecord::class,
      HealthConnectFeatures.FEATURE_MINDFULNESS_SESSION
    ),
    RecordType("Nutrition", NutritionRecord::class),
    RecordType("OvulationTest", OvulationTestRecord::class),
    RecordType("OxygenSaturation", OxygenSaturationRecord::class),
    RecordType(
      "PlannedExerciseSession",
      PlannedExerciseSessionRecord::class,
      HealthConnectFeatures.FEATURE_PLANNED_EXERCISE
    ),
    RecordType("Power", PowerRecord::class),
    RecordType("RespiratoryRate", RespiratoryRateRecord::class),
    RecordType("RestingHeartRate", RestingHeartRateRecord::class),
    RecordType("SexualActivity", SexualActivityRecord::class),
    RecordType(
      "SkinTemperature",
      SkinTemperatureRecord::class,
      HealthConnectFeatures.FEATURE_SKIN_TEMPERATURE
    ),
    RecordType("SleepSession", SleepSessionRecord::class),
    RecordType("Speed", SpeedRecord::class),
    RecordType("Steps", StepsRecord::class),
    RecordType("StepsCadence", StepsCadenceRecord::class),
    RecordType("TotalCaloriesBurned", TotalCaloriesBurnedRecord::class),
    RecordType("Vo2Max", Vo2MaxRecord::class),
    RecordType("Weight", WeightRecord::class),
    RecordType("WheelchairPushes", WheelchairPushesRecord::class)
  )

  private val byName: Map<String, RecordType> = all.associateBy { it.name }

  fun named(name: String): RecordType = byName[name] ?: throw UnknownRecordType(name)
}
