package expo.modules.healthconnect.phone

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

data class AppUsageBucket(val packageName: String, val dayStartMs: Long, val visibleMs: Long, val lastUsedMs: Long)

data class AppUsage(
  val packageName: String,
  val minutesByDay: List<Int>,
  val lastUsedAt: Instant?
) {
  val minutesToday: Int get() = minutesByDay.last()
}

data class UsageEventFact(val packageName: String, val type: Int, val at: Long)

object PhoneAppUsage {
  const val DAYS = 7
  private const val MINUTE_MS = 60_000L
  private const val MINUTES_PER_DAY = 1440

  fun aggregate(buckets: List<AppUsageBucket>, today: LocalDate, zone: ZoneId): List<AppUsage> =
    buckets.groupBy { it.packageName }.mapNotNull { (packageName, own) ->
      val minutes = MutableList(DAYS) { 0L }
      own.forEach { bucket ->
        val day = Instant.ofEpochMilli(bucket.dayStartMs).atZone(zone).toLocalDate()
        val index = DAYS - 1 - ChronoUnit.DAYS.between(day, today).toInt()
        if (index in 0 until DAYS) minutes[index] += bucket.visibleMs
      }
      val byDay = minutes.map { (it / MINUTE_MS).toInt().coerceAtMost(MINUTES_PER_DAY) }
      val last = own.maxOf { it.lastUsedMs }
      if (byDay.all { it == 0 }) null else AppUsage(packageName, byDay, if (last > 0) Instant.ofEpochMilli(last) else null)
    }

  fun frontApp(events: List<UsageEventFact>): String? {
    var front: String? = null
    for (event in events) {
      when (event.type) {
        UsageEvents.Event.ACTIVITY_RESUMED -> front = event.packageName
        UsageEvents.Event.ACTIVITY_PAUSED, UsageEvents.Event.ACTIVITY_STOPPED -> if (front == event.packageName) front = null
        UsageEvents.Event.SCREEN_NON_INTERACTIVE -> front = null
      }
    }
    return front
  }

  fun week(context: Context, zone: ZoneId = ZoneId.systemDefault()): List<AppUsage> {
    val today = LocalDate.now(zone)
    val start = today.minusDays((DAYS - 1).toLong()).atStartOfDay(zone).toInstant().toEpochMilli()
    val stats = context.getSystemService(UsageStatsManager::class.java)
      .queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, System.currentTimeMillis()).orEmpty()
    val buckets = stats.map { stat ->
      val modern = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
      AppUsageBucket(
        stat.packageName,
        stat.firstTimeStamp,
        if (modern) stat.totalTimeVisible else stat.totalTimeInForeground,
        if (modern) stat.lastTimeVisible else stat.lastTimeUsed
      )
    }
    return aggregate(buckets, today, zone)
  }

  fun front(context: Context, zone: ZoneId = ZoneId.systemDefault()): String? {
    val start = LocalDate.now(zone).atStartOfDay(zone).toInstant().toEpochMilli()
    val events = context.getSystemService(UsageStatsManager::class.java).queryEvents(start, System.currentTimeMillis())
    val facts = mutableListOf<UsageEventFact>()
    val event = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(event)
      facts.add(UsageEventFact(event.packageName.orEmpty(), event.eventType, event.timeStamp))
    }
    return frontApp(facts)
  }
}
