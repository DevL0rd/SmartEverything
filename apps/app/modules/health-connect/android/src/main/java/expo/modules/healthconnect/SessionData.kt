@file:OptIn(ExperimentalMindfulnessSessionApi::class)

package expo.modules.healthconnect

import androidx.health.connect.client.feature.ExperimentalMindfulnessSessionApi
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.MindfulnessSessionRecord
import androidx.health.connect.client.records.PlannedExerciseSessionRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.SleepSessionRecord
import kotlinx.serialization.json.JsonObject

object SessionData {
  fun describe(record: Record): JsonObject? = when (record) {
    is ExerciseSessionRecord -> exercise(record)
    is SleepSessionRecord -> sleep(record)
    is MindfulnessSessionRecord -> jsonOf(
      "mindfulnessSessionType" to record.mindfulnessSessionType,
      "title" to record.title,
      "notes" to record.notes
    )
    is PlannedExerciseSessionRecord -> PlannedExerciseData.describe(record)
    else -> null
  }

  private fun exercise(record: ExerciseSessionRecord): JsonObject = jsonOf(
    "exerciseType" to record.exerciseType,
    "title" to record.title,
    "notes" to record.notes,
    "plannedExerciseSessionId" to record.plannedExerciseSessionId,
    "segments" to jsonArrayOf(record.segments) {
      jsonOf(
        "startTime" to moment(it.startTime),
        "endTime" to moment(it.endTime),
        "segmentType" to it.segmentType,
        "repetitions" to it.repetitions
      )
    },
    "laps" to jsonArrayOf(record.laps) {
      jsonOf(
        "startTime" to moment(it.startTime),
        "endTime" to moment(it.endTime),
        "meters" to it.length?.inMeters
      )
    },
    "route" to route(record.exerciseRouteResult)
  )

  private fun route(result: ExerciseRouteResult): JsonObject = when (result) {
    is ExerciseRouteResult.Data -> jsonOf(
      "status" to "recorded",
      "locations" to jsonArrayOf(result.exerciseRoute.route) {
        jsonOf(
          "time" to moment(it.time),
          "latitude" to it.latitude,
          "longitude" to it.longitude,
          "altitudeMeters" to it.altitude?.inMeters,
          "horizontalAccuracyMeters" to it.horizontalAccuracy?.inMeters,
          "verticalAccuracyMeters" to it.verticalAccuracy?.inMeters
        )
      }
    )
    is ExerciseRouteResult.ConsentRequired -> jsonOf("status" to "consent_required")
    is ExerciseRouteResult.NoData -> jsonOf("status" to "absent")
    else -> throw UnmappedValue("exercise route result", result)
  }

  private fun sleep(record: SleepSessionRecord): JsonObject = jsonOf(
    "title" to record.title,
    "notes" to record.notes,
    "stages" to jsonArrayOf(record.stages) {
      jsonOf(
        "startTime" to moment(it.startTime),
        "endTime" to moment(it.endTime),
        "stage" to it.stage
      )
    }
  )
}
