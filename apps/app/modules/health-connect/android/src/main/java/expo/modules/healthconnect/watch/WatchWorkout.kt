@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect.watch

import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.InstantSerializer
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers

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

  fun wire(): WorkoutWire = WorkoutWire(
    sport, state.label, startedAt, endedAt, pausedAt, pausedSeconds,
    if (startedFromPhone) "phone" else "watch",
    heartRate, kcal, steps, distanceM, updatedAt
  )

  fun json(): String = HubJson.encode(wire())
}

@Serializable
class WorkoutWire(
  val sport: String,
  val state: String,
  val startedAt: Instant,
  val endedAt: Instant?,
  val pausedAt: Instant?,
  val pausedSeconds: Long,
  val startedFrom: String,
  val heartRate: Int?,
  val kcal: Int?,
  val steps: Int?,
  val distanceM: Int?,
  val updatedAt: Instant
)
