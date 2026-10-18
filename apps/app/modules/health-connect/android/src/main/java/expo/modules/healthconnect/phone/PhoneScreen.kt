package expo.modules.healthconnect.phone

import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.database.ContentObserver
import android.hardware.display.DisplayManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Display
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONArray
import org.json.JSONObject

class UsageBucket(val startMs: Long, val visibleMs: Long)

object PhoneScreen : PhoneDetailSource {
  private const val TAG = "SmartEverythingPhone"
  private const val PERCENT = 100
  private const val BRIGHTNESS_REST_STEP = 10
  private const val MINUTE_MS = 60_000L
  private const val MINUTES_PER_DAY = 1440
  private const val DAYS = 7
  private const val SECOND_MS = 1000

  override val sections = setOf(PhoneSection.SCREEN)

  private val handler = Handler(Looper.getMainLooper())
  private val weekUsage = SlowReading<List<Pair<LocalDate, Int>>>()
  private var observer: ContentObserver? = null
  private var displays: DisplayManager.DisplayListener? = null
  private var lastFold: String? = null

  fun brightnessPercent(raw: Int, maximum: Int, live: Boolean): Int {
    val exact = raw.coerceIn(0, maximum) * PERCENT / maximum
    return if (live) exact else (exact + BRIGHTNESS_REST_STEP / 2) / BRIGHTNESS_REST_STEP * BRIGHTNESS_REST_STEP
  }

  fun minutesByDay(buckets: List<UsageBucket>, today: LocalDate, zone: ZoneId): List<Pair<LocalDate, Int>> {
    val perDay = buckets.groupBy { Instant.ofEpochMilli(it.startMs).atZone(zone).toLocalDate() }
      .mapValues { entry -> (entry.value.sumOf { it.visibleMs } / MINUTE_MS).toInt().coerceAtMost(MINUTES_PER_DAY) }
    return (DAYS - 1 downTo 0).map { back -> today.minusDays(back.toLong()).let { it to (perDay[it] ?: 0) } }
  }

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> = buildMap {
    brightness(context)?.let { put("brightness", brightnessPercent(it, PhoneBrightnessScale.maximum(), request.live)) }
    automatic(context)?.let { put("auto_brightness", it) }
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? {
    val brightness = brightness(context) ?: return null
    val automatic = automatic(context) ?: return null
    val timeout = setting(context, Settings.System.SCREEN_OFF_TIMEOUT) ?: return null
    return body(
      brightnessPercent(brightness, PhoneBrightnessScale.maximum(), request.live),
      automatic,
      timeout / SECOND_MS,
      fold(context),
      Settings.System.canWrite(context),
      usage(context, request)
    )
  }

  fun body(brightness: Int, auto: Boolean, timeoutSeconds: Int, fold: String?, writable: Boolean, usage: Any): JSONObject = JSONObject()
    .put("brightness", brightness)
    .put("auto", auto)
    .put("timeoutSeconds", timeoutSeconds)
    .put("fold", fold ?: JSONObject.NULL)
    .put("writable", writable)
    .put("usage", usage)

  fun usageBody(unlocksToday: Int, days: List<Pair<LocalDate, Int>>): JSONObject = JSONObject()
    .put("unlocksToday", unlocksToday)
    .put("screenMinutesByDay", JSONArray(days.map { (day, minutes) -> JSONObject().put("day", day.toString()).put("minutes", minutes) }))

  override fun startLive(context: Context) {
    val changed = { PhoneReporter.report(context) }
    val watch = object : ContentObserver(handler) {
      override fun onChange(selfChange: Boolean) = changed()
    }
    listOf(Settings.System.SCREEN_BRIGHTNESS, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_OFF_TIMEOUT).forEach {
      context.contentResolver.registerContentObserver(Settings.System.getUriFor(it), false, watch)
      observer = watch
    }
    val listener = object : DisplayManager.DisplayListener {
      override fun onDisplayAdded(displayId: Int) = changed()

      override fun onDisplayRemoved(displayId: Int) = changed()

      override fun onDisplayChanged(displayId: Int) = changed()
    }
    context.getSystemService(DisplayManager::class.java).registerDisplayListener(listener, handler)
    displays = listener
  }

  override fun stopLive(context: Context) {
    observer?.let { context.contentResolver.unregisterContentObserver(it) }
    displays?.let { context.getSystemService(DisplayManager::class.java).unregisterDisplayListener(it) }
    observer = null
    displays = null
  }

  private fun setting(context: Context, name: String): Int? = try {
    Settings.System.getInt(context.contentResolver, name)
  } catch (failure: Settings.SettingNotFoundException) {
    Log.w(TAG, "The screen setting $name is not present on this phone: ${failure.message}")
    null
  }

  private fun brightness(context: Context): Int? = setting(context, Settings.System.SCREEN_BRIGHTNESS)

  private fun automatic(context: Context): Boolean? =
    setting(context, Settings.System.SCREEN_BRIGHTNESS_MODE)?.let { it == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC }

  fun foldable(context: Context): Boolean = context.packageManager.hasSystemFeature(PackageManager.FEATURE_SENSOR_HINGE_ANGLE)

  private fun fold(context: Context): String? {
    if (!foldable(context)) {
      return null
    }
    val all = context.getSystemService(DisplayManager::class.java).getDisplays(null)
      .filter { it.flags and (Display.FLAG_PRIVATE or Display.FLAG_PRESENTATION) == 0 }
    if (all.none { it.state == Display.STATE_ON }) {
      return lastFold
    }
    val largest = all.maxByOrNull { it.mode.physicalWidth * it.mode.physicalHeight } ?: return lastFold
    lastFold = if (largest.state == Display.STATE_ON) "open" else "folded"
    return lastFold
  }

  private fun usage(context: Context, request: PhoneReadRequest): Any {
    if (!PhoneReadings.usageAllowed(context) || !PhoneStore(context).sensor(PhoneSensor.SCREEN_TIME)) {
      return JSONObject.NULL
    }
    val days = weekUsage.read(request.slow) { week(context) }
    return usageBody(PhoneStore(context).unlocksOn(LocalDate.now().toString()), days)
  }

  private fun week(context: Context): List<Pair<LocalDate, Int>> {
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now()
    val start = today.minusDays((DAYS - 1).toLong()).atStartOfDay(zone).toInstant().toEpochMilli()
    val stats = context.getSystemService(UsageStatsManager::class.java)
      .queryUsageStats(UsageStatsManager.INTERVAL_DAILY, start, System.currentTimeMillis())
    val buckets = stats.map { UsageBucket(it.firstTimeStamp, visibleMs(it)) }
    return minutesByDay(buckets, today, zone)
  }

  private fun visibleMs(stats: UsageStats): Long =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) stats.totalTimeVisible else stats.totalTimeInForeground
}
