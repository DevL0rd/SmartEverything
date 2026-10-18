package expo.modules.healthconnect.watch

import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.jsonArrayOf
import expo.modules.healthconnect.jsonOf
import java.time.Instant
import java.time.temporal.ChronoUnit
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject

class WatchRecords(private val deviceId: String, private val file: WatchFile, private val now: Instant) {
  fun all(): List<HealthEnvelope> =
    hourly() + spots() + file.sleeps.map { sleep(it) } + file.workouts.map { workout(it) } + file.resting.map { resting(it) }

  private fun id(type: String, at: Instant): String =
    "watch:$deviceId:${file.key}:$type:${at.epochSecond}"

  private fun envelope(type: String, start: Instant, end: Instant?, data: JsonObject): HealthEnvelope = HealthEnvelope(
    recordId = id(type, start),
    type = type,
    startTime = start,
    endTime = end,
    zoneOffsetSeconds = file.zoneOffsetSeconds,
    sourceApp = SOURCE_APP,
    lastModified = now,
    data = data
  )

  private fun hourly(): List<HealthEnvelope> = file.minutes
    .groupBy { it.time.truncatedTo(ChronoUnit.HOURS) }
    .flatMap { (hour, minutes) -> hourRecords(hour, minutes) }

  private fun hourRecords(hour: Instant, minutes: List<MinuteSample>): List<HealthEnvelope> {
    val end = minutes.maxOf { it.time }.plusSeconds(MINUTE)
    val steps = minutes.sumOf { it.steps ?: 0 }
    val kcal = minutes.sumOf { it.activeKcal ?: 0 }
    val meters = minutes.sumOf { it.distanceMeters ?: 0 }
    val beats = minutes.filter { (it.heartRate ?: 0) in VALID_HEART_RATE }
    return listOfNotNull(
      steps.takeIf { it > 0 }?.let { envelope("Steps", hour, end, jsonOf("count" to it)) },
      kcal.takeIf { it > 0 }?.let { envelope("ActiveCaloriesBurned", hour, end, jsonOf("kilocalories" to it)) },
      meters.takeIf { it > 0 }?.let { envelope("Distance", hour, end, jsonOf("meters" to it)) },
      beats.takeIf { it.isNotEmpty() }?.let { heartRate(hour, end, it.map { sample -> sample.time to (sample.heartRate ?: 0) }) }
    ) + minutes.filter { (it.spo2 ?: 0) in VALID_SPO2 }.map { oxygen(it.time, it.spo2 ?: 0) }
  }

  private fun heartRate(start: Instant, end: Instant, samples: List<Pair<Instant, Int>>): HealthEnvelope {
    val array = jsonArrayOf(samples) { (time, bpm) -> jsonOf("time" to time.toString(), "bpm" to bpm) }
    return envelope("HeartRate", start, end, jsonOf("samples" to array))
  }

  private fun oxygen(time: Instant, percent: Int): HealthEnvelope =
    envelope("OxygenSaturation", time, null, jsonOf("percent" to percent))

  private fun spots(): List<HealthEnvelope> = file.spots.mapNotNull { spot ->
    when (spot.kind) {
      SpotKind.HEART_RATE -> spot.takeIf { it.value in VALID_HEART_RATE }
        ?.let { heartRate(it.time, it.time.plusSeconds(1), listOf(it.time to it.value)) }
      SpotKind.SPO2 -> spot.takeIf { it.value in VALID_SPO2 }?.let { oxygen(it.time, it.value) }
      SpotKind.STRESS -> null
    }
  }

  private fun sleep(night: SleepNight): HealthEnvelope {
    val stages = jsonArrayOf(night.stages.filter { it.end > it.start }) {
      jsonOf("startTime" to it.start.toString(), "endTime" to it.end.toString(), "stage" to it.stage)
    }
    return envelope("SleepSession", night.start, night.end, jsonOf("title" to null, "notes" to null, "stages" to stages))
  }

  private fun workout(workout: Workout): HealthEnvelope = envelope(
    "ExerciseSession",
    workout.start,
    workout.end,
    jsonOf(
      "exerciseType" to workout.exerciseType,
      "title" to workout.title,
      "notes" to null,
      "plannedExerciseSessionId" to null,
      "segments" to JsonArray(emptyList()),
      "laps" to JsonArray(emptyList()),
      "route" to jsonOf("status" to "absent")
    )
  )

  private fun resting(rate: RestingHeartRate): HealthEnvelope =
    envelope("RestingHeartRate", rate.time, null, jsonOf("bpm" to rate.bpm))

  companion object {
    const val SOURCE_APP = "smarteverything.watch"
    private const val MINUTE = 60L
    private val VALID_HEART_RATE = 25..240
    private val VALID_SPO2 = 70..100
  }
}
