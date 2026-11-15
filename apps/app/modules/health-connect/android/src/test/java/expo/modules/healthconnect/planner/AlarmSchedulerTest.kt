package expo.modules.healthconnect.planner

import expo.modules.healthconnect.MemoryPreferences
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
    key, RingKind.ALARM, "ref-$key", now, RingSound.Tone("default"), 30, true, "Wake",
    AlarmRule(LocalTime.of(7, 0), days, null, null)
  )

  private fun limited(key: String, limit: Int?) = PhoneRing(
    key, RingKind.ALARM, "ref-$key", now, RingSound.Tone("default"), 30, true, "Wake",
    AlarmRule(LocalTime.of(7, 0), everyDay, null, null), 9, limit
  )

  private fun timer(key: String, end: String) =
    PhoneRing(key, RingKind.TIMER, "ref-$key", Instant.parse(end), RingSound.Tone("default"), 0, true, null, null)

  private val everyDay = setOf(0, 1, 2, 3, 4, 5, 6)

  private fun ringSet(hash: String, rings: List<PhoneRing>) = RingSet(hash, rings, emptyList())

  @Test fun installingASetArmsTheNextInstantOfEveryRingAndAcknowledgesTheHash() {
    scheduler.install(ringSet("h1", listOf(alarm("a", everyDay), timer("t", "2026-11-07T12:10:00Z"))), "client")
    assertEquals(Instant.parse("2026-11-08T07:00:00Z"), arming.armed["a"])
    assertEquals(Instant.parse("2026-11-07T12:10:00Z"), arming.armed["t"])
    assertEquals(listOf("client" to "h1"), reports.acks)
  }

  @Test fun aRingDroppedFromTheSetIsCancelled() {
    scheduler.install(ringSet("h1", listOf(alarm("a", everyDay), alarm("b", everyDay))), "client")
    scheduler.install(ringSet("h2", listOf(alarm("a", everyDay))), "client")
    assertTrue("b" in arming.cancelled)
    assertFalse("b" in arming.armed)
  }

  @Test fun aZoneChangeRearmsTheFloatingTimeInTheNewZone() {
    scheduler.install(ringSet("h1", listOf(alarm("a", everyDay))), "client")
    zone = ZoneId.of("Asia/Tokyo")
    scheduler.rearm()
    assertEquals(Instant.parse("2026-11-07T22:00:00Z"), arming.armed["a"])
    assertTrue(reports.misses.isEmpty())
  }

  @Test fun anAlarmOverdueAtBootIsReportedMissedAndTheNextOccurrenceIsArmed() {
    scheduler.install(ringSet("h1", listOf(alarm("a", everyDay))), "client")
    now = Instant.parse("2026-11-08T09:00:00Z")
    scheduler.rearm()
    assertEquals(listOf("a" to Instant.parse("2026-11-08T07:00:00Z")), reports.misses)
    assertEquals(Instant.parse("2026-11-09T07:00:00Z"), arming.armed["a"])
  }

  @Test fun aTimerOverdueAtBootIsReportedMissedAndNeverRungLate() {
    scheduler.install(ringSet("h1", listOf(timer("t", "2026-11-07T12:10:00Z"))), "client")
    now = Instant.parse("2026-11-07T13:00:00Z")
    scheduler.rearm()
    scheduler.rearm()
    assertEquals(listOf("t" to Instant.parse("2026-11-07T12:10:00Z")), reports.misses)
    assertFalse("t" in arming.armed)
  }

  @Test fun aRingThatFiredIsNotReportedMissedAndARepeatingOneRearms() {
    scheduler.install(ringSet("h1", listOf(alarm("a", everyDay), timer("t", "2026-11-07T12:10:00Z"))), "client")
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
    scheduler.install(ringSet("h1", listOf(alarm("a", emptySet()))), "client")
    now = Instant.parse("2026-11-08T07:00:00Z")
    scheduler.fired("a")
    assertFalse("a" in arming.armed)
  }

  @Test fun aChangedRingUnderTheSameKeyStartsAgain() {
    scheduler.install(ringSet("h1", listOf(alarm("a", emptySet()))), "client")
    now = Instant.parse("2026-11-08T07:00:00Z")
    scheduler.fired("a")
    scheduler.install(ringSet("h2", listOf(alarm("a", setOf(1)))), "client")
    assertEquals(Instant.parse("2026-11-09T07:00:00Z"), arming.armed["a"])
  }

  @Test fun theSetSurvivesTheStoreRoundTrip() {
    val set = ringSet("h1", listOf(alarm("a", setOf(1, 3)), timer("t", "2026-11-07T12:10:00Z")))
    scheduler.install(set, "client")
    val reloaded = RingStore(preferences).load()
    assertEquals(set.rings, reloaded.rings)
    assertEquals("client", reloaded.clientId)
  }

  @Test fun snoozingArmsAOneOffTriggerAfterTheRingsOwnMinutes() {
    val ring = alarm("a", everyDay)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    scheduler.snooze(ring, 9)
    assertEquals(now.plusSeconds(540), arming.armed["a#snooze"])
    assertEquals(Instant.parse("2026-11-08T07:00:00Z"), arming.armed["a"])
  }

  @Test fun stoppingCancelsAPendingSnooze() {
    val ring = alarm("a", everyDay)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    scheduler.snooze(ring, 9)
    scheduler.cancelSnooze("a")
    assertFalse("a#snooze" in arming.armed)
    assertTrue("a#snooze" in arming.cancelled)
  }

  @Test fun aRingDroppedFromTheSetAlsoLosesItsSnooze() {
    val ring = alarm("a", everyDay)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    scheduler.snooze(ring, 9)
    scheduler.install(ringSet("h2", emptyList()), "client")
    assertFalse("a#snooze" in arming.armed)
  }

  @Test fun theStoredRingsAreFoundByKey() {
    scheduler.install(ringSet("h1", listOf(alarm("a", everyDay))), "client")
    assertEquals("a", scheduler.ringOf("a")?.ringKey)
    assertEquals(null, scheduler.ringOf("missing"))
  }

  @Test fun aSnoozeLimitCountsEverySnoozeAndRefusesThePastTheLimit() {
    val ring = limited("a", 2)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    assertEquals(2, scheduler.snoozesLeft(ring))
    assertTrue(scheduler.snooze(ring, 9))
    assertEquals(1, scheduler.snoozesLeft(ring))
    assertTrue(scheduler.snooze(ring, 9))
    assertEquals(0, scheduler.snoozesLeft(ring))
    arming.armed.remove("a#snooze")
    assertFalse(scheduler.snooze(ring, 9))
    assertFalse("a#snooze" in arming.armed)
  }

  @Test fun aRingWithoutALimitSnoozesForever() {
    val ring = limited("a", null)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    repeat(20) { assertTrue(scheduler.snooze(ring, 9)) }
    assertNull(scheduler.snoozesLeft(ring))
  }

  @Test fun theCountSurvivesTheStoreAndAnUnchangedRingKeepsItWhenTheSetIsReinstalled() {
    val ring = limited("a", 3)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    scheduler.snooze(ring, 9)
    scheduler.install(ringSet("h2", listOf(ring, alarm("b", everyDay))), "client")
    assertEquals(2, scheduler.snoozesLeft(ring))
    assertEquals(1, RingStore(preferences).load().snoozes["a"])
  }

  @Test fun aChangedRingStartsItsCountAgain() {
    scheduler.install(ringSet("h1", listOf(limited("a", 3))), "client")
    scheduler.snooze(limited("a", 3), 9)
    val edited = limited("a", 4)
    scheduler.install(ringSet("h2", listOf(edited)), "client")
    assertEquals(4, scheduler.snoozesLeft(edited))
  }

  @Test fun stoppingAndTheNextRingOfTheSameKeyResetTheCount() {
    val ring = limited("a", 2)
    scheduler.install(ringSet("h1", listOf(ring)), "client")
    scheduler.snooze(ring, 9)
    scheduler.cancelSnooze("a")
    assertEquals(2, scheduler.snoozesLeft(ring))
    scheduler.snooze(ring, 9)
    now = Instant.parse("2026-11-08T07:00:00Z")
    scheduler.fired("a")
    assertEquals(2, scheduler.snoozesLeft(ring))
  }
}
