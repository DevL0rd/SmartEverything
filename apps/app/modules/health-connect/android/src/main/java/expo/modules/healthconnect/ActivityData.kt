package expo.modules.healthconnect

import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.CyclingPedalingCadenceRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ElevationGainedRecord
import androidx.health.connect.client.records.FloorsClimbedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HydrationRecord
import androidx.health.connect.client.records.PowerRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SpeedRecord
import androidx.health.connect.client.records.StepsCadenceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WheelchairPushesRecord
import java.time.Instant
import org.json.JSONObject

object ActivityData {
  fun describe(record: Record): JSONObject? = when (record) {
    is StepsRecord -> jsonOf("count" to record.count)
    is WheelchairPushesRecord -> jsonOf("count" to record.count)
    is DistanceRecord -> jsonOf("meters" to record.distance.inMeters)
    is ElevationGainedRecord -> jsonOf("meters" to record.elevation.inMeters)
    is ActiveCaloriesBurnedRecord -> jsonOf("kilocalories" to record.energy.inKilocalories)
    is TotalCaloriesBurnedRecord -> jsonOf("kilocalories" to record.energy.inKilocalories)
    is FloorsClimbedRecord -> jsonOf("floors" to record.floors)
    is HydrationRecord -> jsonOf("liters" to record.volume.inLiters)
    is HeartRateRecord -> samples(record.samples, { it.time }) { "bpm" to it.beatsPerMinute }
    is SpeedRecord -> samples(record.samples, { it.time }) {
      "metersPerSecond" to it.speed.inMetersPerSecond
    }
    is PowerRecord -> samples(record.samples, { it.time }) { "watts" to it.power.inWatts }
    is StepsCadenceRecord -> samples(record.samples, { it.time }) { "rate" to it.rate }
    is CyclingPedalingCadenceRecord -> samples(record.samples, { it.time }) {
      "revolutionsPerMinute" to it.revolutionsPerMinute
    }
    else -> null
  }

  private fun <T> samples(
    items: List<T>,
    timeOf: (T) -> Instant,
    valueOf: (T) -> Pair<String, Any>
  ): JSONObject = jsonOf(
    "samples" to jsonArrayOf(items) { jsonOf("time" to moment(timeOf(it)), valueOf(it)) }
  )
}
