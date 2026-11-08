package expo.modules.healthconnect.planner

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NextTriggerTest {
  private val newYork = ZoneId.of("America/New_York")
  private val tokyo = ZoneId.of("Asia/Tokyo")

  private fun at(zone: ZoneId, text: String): Instant = ZonedDateTime.of(LocalDateTime.parse(text), zone).toInstant()

  private fun rule(time: String, days: Set<Int> = emptySet(), onceOn: String? = null, skipOn: String? = null) =
    AlarmRule(LocalTime.parse(time), days, onceOn?.let(LocalDate::parse), skipOn?.let(LocalDate::parse))

  @Test fun aWeekdayRuleRingsAtTheNextMatchingWallTime() {
    val workdays = rule("07:00", setOf(1, 2, 3, 4, 5))
    assertEquals(at(newYork, "2026-11-09T07:00"), NextTrigger.of(workdays, at(newYork, "2026-11-07T10:00"), newYork))
    assertEquals(at(newYork, "2026-11-10T07:00"), NextTrigger.of(workdays, at(newYork, "2026-11-09T07:00"), newYork))
  }

  @Test fun sundayIsZero() {
    val sunday = rule("09:00", setOf(0))
    assertEquals(at(newYork, "2026-11-08T09:00"), NextTrigger.of(sunday, at(newYork, "2026-11-07T10:00"), newYork))
  }

  @Test fun skippingTheNextRingMovesToTheFollowingOccurrence() {
    val daily = rule("07:00", setOf(0, 1, 2, 3, 4, 5, 6), skipOn = "2026-11-08")
    assertEquals(at(newYork, "2026-11-09T07:00"), NextTrigger.of(daily, at(newYork, "2026-11-07T20:00"), newYork))
  }

  @Test fun aRuleWithoutDaysRingsAtTheNextOccurrenceOfTheTime() {
    val single = rule("07:00")
    assertEquals(at(newYork, "2026-11-08T07:00"), NextTrigger.of(single, at(newYork, "2026-11-07T20:00"), newYork))
    assertEquals(at(newYork, "2026-11-07T07:00"), NextTrigger.of(single, at(newYork, "2026-11-07T06:00"), newYork))
  }

  @Test fun onceOnADateRingsOnlyOnThatDate() {
    val once = rule("07:00", onceOn = "2026-12-25")
    assertEquals(at(newYork, "2026-12-25T07:00"), NextTrigger.of(once, at(newYork, "2026-11-07T20:00"), newYork))
    assertNull(NextTrigger.of(once, at(newYork, "2026-12-25T07:00"), newYork))
    assertNull(NextTrigger.of(once, at(newYork, "2026-12-26T00:00"), newYork))
  }

  @Test fun skippingAnOnceOnDateRingsNever() {
    assertNull(NextTrigger.of(rule("07:00", onceOn = "2026-12-25", skipOn = "2026-12-25"), at(newYork, "2026-11-07T20:00"), newYork))
  }

  @Test fun theSpringForwardGapRingsJustAfterTheGap() {
    val daily = rule("02:30", setOf(0, 1, 2, 3, 4, 5, 6))
    val ring = NextTrigger.of(daily, at(newYork, "2026-03-07T12:00"), newYork)
    assertEquals(at(newYork, "2026-03-08T03:30"), ring)
    assertEquals(at(newYork, "2026-03-09T02:30"), NextTrigger.of(daily, checkNotNull(ring), newYork))
  }

  @Test fun theFallBackOverlapRingsOnceAtTheFirstPass() {
    val daily = rule("01:30", setOf(0, 1, 2, 3, 4, 5, 6))
    val first = NextTrigger.of(daily, at(newYork, "2026-11-01T00:00"), newYork)
    assertEquals(Instant.parse("2026-11-01T05:30:00Z"), first)
    assertEquals(at(newYork, "2026-11-02T01:30"), NextTrigger.of(daily, checkNotNull(first), newYork))
  }

  @Test fun theSameRuleFollowsTheZoneOfThePhone() {
    val daily = rule("07:00", setOf(0, 1, 2, 3, 4, 5, 6))
    val now = Instant.parse("2026-11-07T12:00:00Z")
    assertEquals(at(newYork, "2026-11-08T07:00"), NextTrigger.of(daily, now, newYork))
    assertEquals(at(tokyo, "2026-11-08T07:00"), NextTrigger.of(daily, now, tokyo))
  }

  @Test fun theDateIsTheDateInThePhoneZoneNotUtc() {
    val sunday = rule("07:00", setOf(0))
    val now = Instant.parse("2026-11-07T20:00:00Z")
    assertEquals(at(tokyo, "2026-11-08T07:00"), NextTrigger.of(sunday, now, tokyo))
  }

  @Test fun aTimerRingIsItsEndInstantUntilItHasPassed() {
    val end = Instant.parse("2026-11-07T12:10:00Z")
    val timer = PhoneRing("t", RingKind.TIMER, "r", end, "default", 0, true, null, null)
    assertEquals(end, NextTrigger.of(timer, Instant.parse("2026-11-07T12:00:00Z"), newYork))
    assertNull(NextTrigger.of(timer, end, newYork))
  }
}
