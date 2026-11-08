package expo.modules.healthconnect.planner

import expo.modules.healthconnect.MemoryPreferences
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmSchedulerTest {
  private class Arming : AlarmArming {
    val armed = mutableMapOf<String, Instant>()
    val cancelled = mutableListOf<String>()

    override fun arm(ring: PhoneRing, at: Instant) {
      armed[ring.ringKey] = at
    }

    override fun cancel(ringKey: String) {
      armed.remove(ringKey)
      cancelled += ringKey
    }
  }

  private class Reports : RingReports {
    val acks = mutableListOf<Pair<String, String>>()
    val misses = mutableListOf<Pair<String, Instant>>()

    override fun acknowledge(clientId: String, hash: String) {
      acks += clientId to hash
    }

    override fun missed(clientId: String, ring: PhoneRing, dueAt: Instant) {
      misses += ring.ringKey to dueAt
    }
  }

  private var now = Instant.parse("2026-11-07T12:00:00Z")
  private var zone = ZoneId.of("UTC")
  private val arming = Arming()
  private val reports = Reports()
  private val preferences = MemoryPreferences()
  private val scheduler = AlarmScheduler(RingStore(preferences), arming, reports, { zone }, { now })

  private fun alarm(key: String, days: Set<Int>) = PhoneRing(
    key, RingKind.ALARM, "ref-$key", now, "default", 30, true, "Wake",
    AlarmRule(LocalTime.of(7, 0), days, null, null)
  )

  private fun timer(key: String, end: String) =
    PhoneRing(key, RingKind.TIMER, "ref-$key", Instant.parse(end), "default", 0, true, null, null)

  private val everyDay = setOf(0, 1, 2, 3, 4, 5, 6)

  @Test fun installingASetArmsTheNextInstantOfEveryRingAndAcknowledgesTheHash() {
    scheduler.install(RingSet("h1", listOf(alarm("a", everyDay), timer("t", "2026-11-07T12:10:00Z"))), "client")
    assertEquals(Instant.parse("2026-11-08T07:00:00Z"), arming.armed["a"])
    assertEquals(Instant.parse("2026-11-07T12:10:00Z"), arming.armed["t"])
    assertEquals(listOf("client" to "h1"), reports.acks)
  }

  @Test fun aRingDroppedFromTheSetIsCancelled() {
    scheduler.install(RingSet("h1", listOf(alarm("a", everyDay), alarm("b", everyDay))), "client")
    scheduler.install(RingSet("h2", listOf(alarm("a", everyDay))), "client")
    assertTrue("b" in arming.cancelled)
    assertFalse("b" in arming.armed)
  }

  @Test fun aZoneChangeRearmsTheFloatingTimeInTheNewZone() {
    scheduler.install(RingSet("h1", listOf(alarm("a", everyDay))), "client")
    zone = ZoneId.of("Asia/Tokyo")
    scheduler.rearm()
    assertEquals(Instant.parse("2026-11-07T22:00:00Z"), arming.armed["a"])
    assertTrue(reports.misses.isEmpty())
  }

  @Test fun anAlarmOverdueAtBootIsReportedMissedAndTheNextOccurrenceIsArmed() {
    scheduler.install(RingSet("h1", listOf(alarm("a", everyDay))), "client")
    now = Instant.parse("2026-11-08T09:00:00Z")
    scheduler.rearm()
    assertEquals(listOf("a" to Instant.parse("2026-11-08T07:00:00Z")), reports.misses)
    assertEquals(Instant.parse("2026-11-09T07:00:00Z"), arming.armed["a"])
  }

  @Test fun aTimerOverdueAtBootIsReportedMissedAndNeverRungLate() {
    scheduler.install(RingSet("h1", listOf(timer("t", "2026-11-07T12:10:00Z"))), "client")
    now = Instant.parse("2026-11-07T13:00:00Z")
    scheduler.rearm()
    scheduler.rearm()
    assertEquals(listOf("t" to Instant.parse("2026-11-07T12:10:00Z")), reports.misses)
    assertFalse("t" in arming.armed)
  }

  @Test fun aRingThatFiredIsNotReportedMissedAndARepeatingOneRearms() {
    scheduler.install(RingSet("h1", listOf(alarm("a", everyDay), timer("t", "2026-11-07T12:10:00Z"))), "client")
    now = Instant.parse("2026-11-07T12:10:00Z")
    scheduler.fired("t")
    now = Instant.parse("2026-11-08T07:00:00Z")
    scheduler.fired("a")
    scheduler.rearm()
    assertTrue(reports.misses.isEmpty())
    assertEquals(Instant.parse("2026-11-09T07:00:00Z"), arming.armed["a"])
    assertFalse("t" in arming.armed)
  }

  @Test fun aSingleShotAlarmDoesNotRingAgainAfterItFired() {
    scheduler.install(RingSet("h1", listOf(alarm("a", emptySet()))), "client")
    now = Instant.parse("2026-11-08T07:00:00Z")
    scheduler.fired("a")
    assertFalse("a" in arming.armed)
  }

  @Test fun aChangedRingUnderTheSameKeyStartsAgain() {
    scheduler.install(RingSet("h1", listOf(alarm("a", emptySet()))), "client")
    now = Instant.parse("2026-11-08T07:00:00Z")
    scheduler.fired("a")
    scheduler.install(RingSet("h2", listOf(alarm("a", setOf(1)))), "client")
    assertEquals(Instant.parse("2026-11-09T07:00:00Z"), arming.armed["a"])
  }

  @Test fun theSetSurvivesTheStoreRoundTrip() {
    val set = RingSet("h1", listOf(alarm("a", setOf(1, 3)), timer("t", "2026-11-07T12:10:00Z")))
    scheduler.install(set, "client")
    val reloaded = RingStore(preferences).load()
    assertEquals(set.rings, reloaded.rings)
    assertEquals("client", reloaded.clientId)
  }
}
