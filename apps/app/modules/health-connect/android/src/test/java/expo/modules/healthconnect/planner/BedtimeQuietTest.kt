package expo.modules.healthconnect.planner

import expo.modules.healthconnect.MemoryPreferences
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BedtimeQuietTest {
  private class Arming : QuietArming {
    val armed = sortedSetOf<Instant>()
    val cancelled = mutableListOf<Instant>()

    override fun arm(at: Instant) {
      armed += at
    }

    override fun cancel(at: Instant) {
      armed -= at
      cancelled += at
    }
  }

  private class Filter(var granted: Boolean = true) : QuietFilter {
    var on = false
    val changes = mutableListOf<Boolean>()

    override fun allowed(): Boolean = granted

    override fun set(on: Boolean) {
      this.on = on
      changes += on
    }
  }

  private fun window(day: Int) = BedtimeWindow(
    Instant.parse("2026-11-${day}T21:30:00Z"),
    Instant.parse("2026-11-${day}T22:00:00Z"),
    Instant.parse("2026-11-${day + 1}T06:00:00Z")
  )

  private var now = Instant.parse("2026-11-14T12:00:00Z")
  private val arming = Arming()
  private val filter = Filter()
  private val preferences = MemoryPreferences()
  private val quiet get() = BedtimeQuiet(preferences, arming, filter) { now }

  @Test fun theWindowIsQuietFromWindDownUntilTheWakeTime() {
    val w = window(14)
    assertFalse(BedtimePlan.wanted(listOf(w), Instant.parse("2026-11-14T21:29:59Z")))
    assertTrue(BedtimePlan.wanted(listOf(w), Instant.parse("2026-11-14T21:30:00Z")))
    assertTrue(BedtimePlan.wanted(listOf(w), Instant.parse("2026-11-15T05:59:59Z")))
    assertFalse(BedtimePlan.wanted(listOf(w), Instant.parse("2026-11-15T06:00:00Z")))
  }

  @Test fun theStepsAreTheFutureOnAndOffMomentsInOrder() {
    val steps = BedtimePlan.steps(listOf(window(15), window(14)), Instant.parse("2026-11-14T22:30:00Z"))
    assertEquals(
      listOf("2026-11-15T06:00:00Z" to false, "2026-11-15T21:30:00Z" to true, "2026-11-16T06:00:00Z" to false),
      steps.map { it.at.toString() to it.on }
    )
  }

  @Test fun installingArmsEveryFutureStepAndLeavesTheFilterAloneBeforeWindDown() {
    quiet.install(listOf(window(14)))
    assertEquals(listOf("2026-11-14T21:30:00Z", "2026-11-15T06:00:00Z"), arming.armed.map { it.toString() })
    assertTrue(filter.changes.isEmpty())
  }

  @Test fun windDownTurnsTheFilterOnOnceAndTheWakeTimeTurnsItOff() {
    quiet.install(listOf(window(14)))
    now = Instant.parse("2026-11-14T21:30:00Z")
    quiet.reconcile()
    quiet.reconcile()
    assertEquals(listOf(true), filter.changes)
    now = Instant.parse("2026-11-15T06:00:00Z")
    quiet.reconcile()
    assertEquals(listOf(true, false), filter.changes)
    assertTrue(arming.armed.isEmpty())
  }

  @Test fun aBootInTheMiddleOfTheWindowTurnsTheFilterOn() {
    quiet.install(listOf(window(14)))
    now = Instant.parse("2026-11-15T01:00:00Z")
    quiet.reconcile()
    assertTrue(filter.on)
    assertEquals(listOf("2026-11-15T06:00:00Z"), arming.armed.map { it.toString() })
  }

  @Test fun theFilterIsNeverTurnedOffWhenTheAppNeverTurnedItOn() {
    quiet.install(listOf(window(14)))
    now = Instant.parse("2026-11-15T07:00:00Z")
    quiet.reconcile()
    assertTrue(filter.changes.isEmpty())
  }

  @Test fun withoutNotificationPolicyAccessNothingChangesAndItIsRetriedLater() {
    filter.granted = false
    quiet.install(listOf(window(14)))
    now = Instant.parse("2026-11-14T22:00:00Z")
    quiet.reconcile()
    assertTrue(filter.changes.isEmpty())
    filter.granted = true
    quiet.reconcile()
    assertEquals(listOf(true), filter.changes)
  }

  @Test fun aNewSetReplacesTheOldArmsAndEndsAQuietWindowThatNoLongerExists() {
    quiet.install(listOf(window(14)))
    now = Instant.parse("2026-11-14T23:00:00Z")
    quiet.reconcile()
    quiet.install(emptyList())
    assertEquals(listOf(true, false), filter.changes)
    assertTrue(arming.armed.isEmpty())
    assertTrue(Instant.parse("2026-11-15T06:00:00Z") in arming.cancelled)
  }
}
