package expo.modules.healthconnect.planner

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

class AlarmRule(
  val time: LocalTime,
  val days: Set<Int>,
  val onceOn: LocalDate?,
  val skipOn: LocalDate?
) {
  init {
    require(days.all { it in WEEKDAYS }) { "weekdays are 0 (Sunday) to 6 (Saturday), got $days" }
    require(onceOn == null || days.isEmpty()) { "an alarm rings once on a date or on weekdays, not both" }
  }

  val repeats: Boolean get() = onceOn == null && days.isNotEmpty()

  override fun equals(other: Any?): Boolean =
    other is AlarmRule && time == other.time && days == other.days && onceOn == other.onceOn && skipOn == other.skipOn

  override fun hashCode(): Int = listOf(time, days, onceOn, skipOn).hashCode()

  private companion object {
    val WEEKDAYS = 0..6
  }
}

object NextTrigger {
  fun of(rule: AlarmRule, now: Instant, zone: ZoneId): Instant? {
    val once = rule.onceOn
    if (once != null) {
      return at(once, rule, zone).takeIf { once != rule.skipOn && it.isAfter(now) }
    }
    val today = now.atZone(zone).toLocalDate()
    return generateSequence(today) { it.plusDays(1) }
      .filter { it != rule.skipOn && (rule.days.isEmpty() || weekday(it) in rule.days) }
      .map { at(it, rule, zone) }
      .first { it.isAfter(now) }
  }

  fun of(ring: PhoneRing, now: Instant, zone: ZoneId): Instant? {
    val rule = ring.rule ?: return ring.dueAt.takeIf { it.isAfter(now) }
    return of(rule, now, zone)
  }

  private fun weekday(date: LocalDate): Int = date.dayOfWeek.value % DAYS_IN_WEEK

  private fun at(date: LocalDate, rule: AlarmRule, zone: ZoneId): Instant =
    ZonedDateTime.of(date, rule.time, zone).toInstant()

  private const val DAYS_IN_WEEK = 7
}
