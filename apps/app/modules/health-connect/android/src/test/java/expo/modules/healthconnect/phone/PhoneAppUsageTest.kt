package expo.modules.healthconnect.phone

import android.app.usage.UsageEvents
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PhoneAppUsageTest {
  private val today = LocalDate.of(2026, 10, 18)
  private val minute = 60_000L

  private fun dayStart(date: LocalDate): Long = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

  @Test
  fun `minutes are placed on the seven days ending today`() {
    val usage = PhoneAppUsage.aggregate(
      listOf(
        AppUsageBucket("a", dayStart(today), 12 * minute, dayStart(today) + 5),
        AppUsageBucket("a", dayStart(today.minusDays(6)), 30 * minute, 0),
        AppUsageBucket("a", dayStart(today.minusDays(7)), 99 * minute, 0)
      ),
      today,
      ZoneOffset.UTC
    ).single()
    assertEquals(listOf(30, 0, 0, 0, 0, 0, 12), usage.minutesByDay)
    assertEquals(12, usage.minutesToday)
    assertEquals(Instant.ofEpochMilli(dayStart(today) + 5), usage.lastUsedAt)
  }

  @Test
  fun `several buckets of one day add up`() {
    val usage = PhoneAppUsage.aggregate(
      listOf(AppUsageBucket("a", dayStart(today), 5 * minute, 1), AppUsageBucket("a", dayStart(today) + 1, 6 * minute, 2)),
      today,
      ZoneOffset.UTC
    ).single()
    assertEquals(11, usage.minutesToday)
  }

  @Test
  fun `an app that was never visible is left out and a day never exceeds 24 hours`() {
    val usage = PhoneAppUsage.aggregate(
      listOf(AppUsageBucket("idle", dayStart(today), 20_000, 0), AppUsageBucket("long", dayStart(today), 2000 * minute, 0)),
      today,
      ZoneOffset.UTC
    )
    assertEquals(listOf("long"), usage.map { it.packageName })
    assertEquals(1440, usage.single().minutesToday)
    assertNull(usage.single().lastUsedAt)
  }

  @Test
  fun `the front app is the last one resumed and not paused`() {
    val front = PhoneAppUsage.frontApp(
      listOf(
        UsageEventFact("a", UsageEvents.Event.ACTIVITY_RESUMED, 1),
        UsageEventFact("a", UsageEvents.Event.ACTIVITY_PAUSED, 2),
        UsageEventFact("b", UsageEvents.Event.ACTIVITY_RESUMED, 3)
      )
    )
    assertEquals("b", front)
  }

  @Test
  fun `no app is in front after it paused or the screen turned off`() {
    val paused = listOf(
      UsageEventFact("a", UsageEvents.Event.ACTIVITY_RESUMED, 1),
      UsageEventFact("a", UsageEvents.Event.ACTIVITY_STOPPED, 2)
    )
    val off = listOf(
      UsageEventFact("a", UsageEvents.Event.ACTIVITY_RESUMED, 1),
      UsageEventFact("android", UsageEvents.Event.SCREEN_NON_INTERACTIVE, 2)
    )
    assertNull(PhoneAppUsage.frontApp(paused))
    assertNull(PhoneAppUsage.frontApp(off))
  }

  @Test
  fun `another app pausing does not take the front away`() {
    val front = PhoneAppUsage.frontApp(
      listOf(
        UsageEventFact("b", UsageEvents.Event.ACTIVITY_RESUMED, 1),
        UsageEventFact("a", UsageEvents.Event.ACTIVITY_PAUSED, 2)
      )
    )
    assertEquals("b", front)
  }
}
