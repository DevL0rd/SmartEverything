package expo.modules.healthconnect

import androidx.health.connect.client.records.ExerciseCompletionGoal
import androidx.health.connect.client.records.ExercisePerformanceTarget
import androidx.health.connect.client.records.PlannedExerciseSessionRecord
import java.time.Duration
import kotlinx.serialization.json.JsonObject

object PlannedExerciseData {
  fun describe(record: PlannedExerciseSessionRecord): JsonObject = jsonOf(
    "exerciseType" to record.exerciseType,
    "title" to record.title,
    "notes" to record.notes,
    "completedExerciseSessionId" to record.completedExerciseSessionId,
    "blocks" to jsonArrayOf(record.blocks) { block ->
      jsonOf(
        "repetitions" to block.repetitions,
        "description" to block.description,
        "steps" to jsonArrayOf(block.steps) { step ->
          jsonOf(
            "exerciseType" to step.exerciseType,
            "exercisePhase" to step.exercisePhase,
            "description" to step.description,
            "completionGoal" to goal(step.completionGoal),
            "performanceTargets" to jsonArrayOf(step.performanceTargets) { target(it) }
          )
        }
      )
    }
  )

  private fun seconds(duration: Duration): Double = duration.toMillis() / 1000.0

  private fun goal(goal: ExerciseCompletionGoal): JsonObject = when (goal) {
    is ExerciseCompletionGoal.DistanceGoal ->
      jsonOf("kind" to "distance", "meters" to goal.distance.inMeters)
    is ExerciseCompletionGoal.DistanceAndDurationGoal -> jsonOf(
      "kind" to "distance_and_duration",
      "meters" to goal.distance.inMeters,
      "seconds" to seconds(goal.duration)
    )
    is ExerciseCompletionGoal.DurationGoal ->
      jsonOf("kind" to "duration", "seconds" to seconds(goal.duration))
    is ExerciseCompletionGoal.RepetitionsGoal ->
      jsonOf("kind" to "repetitions", "count" to goal.repetitions)
    is ExerciseCompletionGoal.StepsGoal -> jsonOf("kind" to "steps", "count" to goal.steps)
    is ExerciseCompletionGoal.TotalCaloriesBurnedGoal ->
      jsonOf("kind" to "total_calories", "kilocalories" to goal.totalCalories.inKilocalories)
    is ExerciseCompletionGoal.ActiveCaloriesBurnedGoal ->
      jsonOf("kind" to "active_calories", "kilocalories" to goal.activeCalories.inKilocalories)
    is ExerciseCompletionGoal.ManualCompletion -> jsonOf("kind" to "manual")
    is ExerciseCompletionGoal.UnknownGoal -> jsonOf("kind" to "unknown")
    else -> throw UnmappedValue("completion goal", goal)
  }

  private fun target(target: ExercisePerformanceTarget): JsonObject = when (target) {
    is ExercisePerformanceTarget.PowerTarget -> jsonOf(
      "kind" to "power",
      "minWatts" to target.minPower.inWatts,
      "maxWatts" to target.maxPower.inWatts
    )
    is ExercisePerformanceTarget.SpeedTarget -> jsonOf(
      "kind" to "speed",
      "minMetersPerSecond" to target.minSpeed.inMetersPerSecond,
      "maxMetersPerSecond" to target.maxSpeed.inMetersPerSecond
    )
    is ExercisePerformanceTarget.CadenceTarget ->
      jsonOf("kind" to "cadence", "minRate" to target.minCadence, "maxRate" to target.maxCadence)
    is ExercisePerformanceTarget.HeartRateTarget -> jsonOf(
      "kind" to "heart_rate",
      "minBpm" to target.minHeartRate,
      "maxBpm" to target.maxHeartRate
    )
    is ExercisePerformanceTarget.WeightTarget ->
      jsonOf("kind" to "weight", "kilograms" to target.mass.inKilograms)
    is ExercisePerformanceTarget.RateOfPerceivedExertionTarget ->
      jsonOf("kind" to "rate_of_perceived_exertion", "rpe" to target.rpe)
    is ExercisePerformanceTarget.AmrapTarget -> jsonOf("kind" to "amrap")
    is ExercisePerformanceTarget.UnknownTarget -> jsonOf("kind" to "unknown")
    else -> throw UnmappedValue("performance target", target)
  }
}
