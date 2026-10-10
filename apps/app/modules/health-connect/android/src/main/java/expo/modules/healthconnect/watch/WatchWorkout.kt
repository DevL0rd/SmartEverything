package expo.modules.healthconnect.watch

import expo.modules.healthconnect.jsonOf
import java.time.Duration
import java.time.Instant
import org.json.JSONObject

enum class WorkoutChange(val verb: String) { PAUSE("pause"), RESUME("resume"), FINISH("finish") }

enum class WorkoutState(val label: String) { RUNNING("running"), PAUSED("paused"), FINISHED("finished") }

data class WorkoutInfo(
  val sport: String,
  val state: WorkoutState,
  val startedAt: Instant,
  val startedFromPhone: Boolean,
  val endedAt: Instant? = null,
  val pausedAt: Instant? = null,
  val pausedSeconds: Long = 0,
  val heartRate: Int? = null,
  val kcal: Int? = null,
  val steps: Int? = null,
  val distanceM: Int? = null,
  val updatedAt: Instant = Instant.now()
) {
  val active: Boolean get() = state != WorkoutState.FINISHED

  fun paused(at: Instant): WorkoutInfo =
    if (state == WorkoutState.RUNNING) copy(state = WorkoutState.PAUSED, pausedAt = at, updatedAt = at) else this

  fun resumed(at: Instant): WorkoutInfo {
    val since = pausedAt ?: return this
    return copy(
      state = WorkoutState.RUNNING,
      pausedAt = null,
      pausedSeconds = pausedSeconds + Duration.between(since, at).seconds,
      updatedAt = at
    )
  }

  fun finished(at: Instant): WorkoutInfo = resumed(at).copy(state = WorkoutState.FINISHED, endedAt = at, updatedAt = at)

  fun toJson(): JSONObject = jsonOf(
    "sport" to sport,
    "state" to state.label,
    "startedAt" to startedAt.toString(),
    "endedAt" to endedAt?.toString(),
    "pausedAt" to pausedAt?.toString(),
    "pausedSeconds" to pausedSeconds,
    "startedFrom" to if (startedFromPhone) "phone" else "watch",
    "heartRate" to heartRate,
    "kcal" to kcal,
    "steps" to steps,
    "distanceM" to distanceM,
    "updatedAt" to updatedAt.toString()
  )
}
