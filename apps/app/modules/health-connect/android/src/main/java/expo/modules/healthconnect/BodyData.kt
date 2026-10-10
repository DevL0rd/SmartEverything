package expo.modules.healthconnect

import androidx.health.connect.client.records.BasalBodyTemperatureRecord
import androidx.health.connect.client.records.BasalMetabolicRateRecord
import androidx.health.connect.client.records.BloodGlucoseRecord
import androidx.health.connect.client.records.BloodPressureRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.BodyTemperatureRecord
import androidx.health.connect.client.records.BodyWaterMassRecord
import androidx.health.connect.client.records.BoneMassRecord
import androidx.health.connect.client.records.CervicalMucusRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.HeightRecord
import androidx.health.connect.client.records.IntermenstrualBleedingRecord
import androidx.health.connect.client.records.LeanBodyMassRecord
import androidx.health.connect.client.records.MenstruationFlowRecord
import androidx.health.connect.client.records.MenstruationPeriodRecord
import androidx.health.connect.client.records.OvulationTestRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RespiratoryRateRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SexualActivityRecord
import androidx.health.connect.client.records.SkinTemperatureRecord
import androidx.health.connect.client.records.Vo2MaxRecord
import androidx.health.connect.client.records.WeightRecord
import org.json.JSONObject

object BodyData {
  fun describe(record: Record): JSONObject? = vital(record) ?: measure(record) ?: cycle(record)

  private fun vital(record: Record): JSONObject? = when (record) {
    is RestingHeartRateRecord -> jsonOf("bpm" to record.beatsPerMinute)
    is HeartRateVariabilityRmssdRecord ->
      jsonOf("milliseconds" to record.heartRateVariabilityMillis)
    is OxygenSaturationRecord -> jsonOf("percent" to record.percentage.value)
    is RespiratoryRateRecord -> jsonOf("rate" to record.rate)
    is BodyTemperatureRecord -> jsonOf(
      "celsius" to record.temperature.inCelsius,
      "measurementLocation" to record.measurementLocation
    )
    is BasalBodyTemperatureRecord -> jsonOf(
      "celsius" to record.temperature.inCelsius,
      "measurementLocation" to record.measurementLocation
    )
    is SkinTemperatureRecord -> jsonOf(
      "baselineCelsius" to record.baseline?.inCelsius,
      "measurementLocation" to record.measurementLocation,
      "deltas" to jsonArrayOf(record.deltas) {
        jsonOf("time" to moment(it.time), "celsius" to it.delta.inCelsius)
      }
    )
    is BloodPressureRecord -> jsonOf(
      "systolicMmHg" to record.systolic.inMillimetersOfMercury,
      "diastolicMmHg" to record.diastolic.inMillimetersOfMercury,
      "bodyPosition" to record.bodyPosition,
      "measurementLocation" to record.measurementLocation
    )
    is BloodGlucoseRecord -> jsonOf(
      "millimolesPerLiter" to record.level.inMillimolesPerLiter,
      "specimenSource" to record.specimenSource,
      "mealType" to record.mealType,
      "relationToMeal" to record.relationToMeal
    )
    is Vo2MaxRecord -> jsonOf(
      "mlPerKgPerMin" to record.vo2MillilitersPerMinuteKilogram,
      "measurementMethod" to record.measurementMethod
    )
    else -> null
  }

  private fun measure(record: Record): JSONObject? = when (record) {
    is WeightRecord -> jsonOf("kilograms" to record.weight.inKilograms)
    is LeanBodyMassRecord -> jsonOf("kilograms" to record.mass.inKilograms)
    is BoneMassRecord -> jsonOf("kilograms" to record.mass.inKilograms)
    is BodyWaterMassRecord -> jsonOf("kilograms" to record.mass.inKilograms)
    is HeightRecord -> jsonOf("meters" to record.height.inMeters)
    is BodyFatRecord -> jsonOf("percent" to record.percentage.value)
    is BasalMetabolicRateRecord ->
      jsonOf("kilocaloriesPerDay" to record.basalMetabolicRate.inKilocaloriesPerDay)
    else -> NutritionData.describe(record)
  }

  private fun cycle(record: Record): JSONObject? = when (record) {
    is MenstruationFlowRecord -> jsonOf("flow" to record.flow)
    is MenstruationPeriodRecord -> JSONObject()
    is IntermenstrualBleedingRecord -> JSONObject()
    is OvulationTestRecord -> jsonOf("result" to record.result)
    is CervicalMucusRecord ->
      jsonOf("appearance" to record.appearance, "sensation" to record.sensation)
    is SexualActivityRecord -> jsonOf("protectionUsed" to record.protectionUsed)
    else -> null
  }
}
