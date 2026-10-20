package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.WorkoutChange
import expo.modules.healthconnect.watch.WorkoutInfo
import expo.modules.healthconnect.watch.WorkoutState
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiWorkoutsTest {
  private val sent = mutableListOf<ByteArray>()
  private val changes = mutableListOf<WorkoutInfo>()
  private val started = Instant.parse("2026-10-18T14:02:11Z")

  private fun workouts(remembered: WorkoutInfo?) = XiaomiWorkouts(
    XiaomiWorkoutHooks(
      send = { sent.add(it) },
      note = { _, _ -> },
      changed = { changes.add(it) },
      sportsRead = {},
      finished = {}
    ),
    SportList(listOf(XiaomiSports.code("treadmill") ?: 0), "test"),
    remembered
  )

  private fun running(state: WorkoutState = WorkoutState.RUNNING) =
    WorkoutInfo("treadmill", state, started, startedFromPhone = true, pausedAt = started.takeIf { state == WorkoutState.PAUSED })

  @Test
  fun `a restarted connection still pauses the workout that was running`() {
    val outcome = workouts(running()).change(WorkoutChange.PAUSE)
    assertTrue(outcome.detail, outcome.ok)
    val status = XiaomiCommand.parse(sent.single()).part(XiaomiCommand.HEALTH)?.message(20)
    assertEquals(XiaomiSports.code("treadmill"), status?.int(3))
    assertEquals(1, status?.int(4))
    assertEquals(WorkoutState.PAUSED, changes.last().state)
  }

  @Test
  fun `a restarted connection resumes a paused workout`() {
    val outcome = workouts(running(WorkoutState.PAUSED)).change(WorkoutChange.RESUME)
    assertTrue(outcome.detail, outcome.ok)
    assertEquals(WorkoutState.RUNNING, changes.last().state)
  }

  @Test
  fun `a finished workout is not remembered across a restart`() {
    val outcome = workouts(running().finished(started.plusSeconds(600))).change(WorkoutChange.PAUSE)
    assertFalse(outcome.ok)
    assertTrue(sent.isEmpty())
  }

  @Test
  fun `nothing remembered means no workout is running`() {
    assertFalse(workouts(null).change(WorkoutChange.PAUSE).ok)
  }
}
