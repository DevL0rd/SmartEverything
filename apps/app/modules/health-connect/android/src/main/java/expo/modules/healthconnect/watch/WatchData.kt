package expo.modules.healthconnect.watch

import java.time.Instant

class MinuteSample(
  val time: Instant,
  val steps: Int?,
  val activeKcal: Int?,
  val distanceMeters: Int?,
  val heartRate: Int?,
  val spo2: Int?,
  val stress: Int?
)

enum class SpotKind { HEART_RATE, SPO2, STRESS }

class SpotSample(val time: Instant, val kind: SpotKind, val value: Int)

class SleepStage(val start: Instant, val end: Instant, val stage: Int)

class SleepNight(val start: Instant, val end: Instant, val stages: List<SleepStage>)

class Workout(val start: Instant, val end: Instant, val exerciseType: Int, val title: String)

class RestingHeartRate(val time: Instant, val bpm: Int)

enum class SampleKind(val label: String) { STRESS("stress"), VITALITY("vitality") }

class KindSample(val kind: SampleKind, val time: Instant, val value: Int)

class RoutePoint(
  val time: Instant,
  val latitude: Double,
  val longitude: Double,
  val altitudeMeters: Double?,
  val accuracyMeters: Double?
)

class Route(val start: Instant, val points: List<RoutePoint>)

class WatchFile(
  val key: String,
  val label: String,
  val zoneOffsetSeconds: Int,
  val minutes: List<MinuteSample> = emptyList(),
  val spots: List<SpotSample> = emptyList(),
  val sleeps: List<SleepNight> = emptyList(),
  val workouts: List<Workout> = emptyList(),
  val resting: List<RestingHeartRate> = emptyList(),
  val samples: List<KindSample> = emptyList(),
  val routes: List<Route> = emptyList()
) {
  val allSamples: List<KindSample>
    get() = samples +
      minutes.mapNotNull { m -> m.stress?.takeIf { it in VALID_STRESS }?.let { KindSample(SampleKind.STRESS, m.time, it) } } +
      spots.filter { it.kind == SpotKind.STRESS && it.value in VALID_STRESS }.map { KindSample(SampleKind.STRESS, it.time, it.value) }

  fun summary(): String = listOfNotNull(
    minutes.size.takeIf { it > 0 }?.let {
      "$it minutes ${minutes.first().time}–${minutes.last().time}, ${minutes.sumOf { m -> m.steps ?: 0 }} steps"
    },
    spots.size.takeIf { it > 0 }?.let { "$it spot readings" },
    sleeps.size.takeIf { it > 0 }?.let { "$it sleep" },
    workouts.size.takeIf { it > 0 }?.let { "$it workout(s)" },
    resting.size.takeIf { it > 0 }?.let { "resting HR" },
    allSamples.size.takeIf { it > 0 }?.let { "$it stress/vitality" },
    routes.sumOf { it.points.size }.takeIf { it > 0 }?.let { "$it GPS points" }
  ).joinToString().ifEmpty { "no samples" }

  private companion object {
    val VALID_STRESS = 1..100
  }
}

object SleepStages {
  const val UNKNOWN = 0
  const val AWAKE = 1
  const val OUT_OF_BED = 3
  const val LIGHT = 4
  const val DEEP = 5
  const val REM = 6
}

object ExerciseTypes {
  const val OTHER = 0
  const val BIKING = 8
  const val BIKING_STATIONARY = 9
  const val ELLIPTICAL = 25
  const val HIIT = 36
  const val ROWING_MACHINE = 54
  const val RUNNING = 56
  const val RUNNING_TREADMILL = 57
  const val SWIMMING_POOL = 74
  const val WALKING = 79
  const val YOGA = 83
}
