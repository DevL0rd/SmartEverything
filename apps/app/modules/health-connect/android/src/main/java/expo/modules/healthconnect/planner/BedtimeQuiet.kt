package expo.modules.healthconnect.planner

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.diagnostics.NativeLog
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

class QuietStep(val at: Instant, val on: Boolean)

object BedtimePlan {
  fun steps(windows: List<BedtimeWindow>, now: Instant): List<QuietStep> =
    windows
      .flatMap { listOf(QuietStep(it.windDownAt, true), QuietStep(it.wakeAt, false)) }
      .filter { it.at.isAfter(now) }
      .sortedBy { it.at }

  fun wanted(windows: List<BedtimeWindow>, now: Instant): Boolean =
    windows.any { !now.isBefore(it.windDownAt) && now.isBefore(it.wakeAt) }
}

interface QuietArming {
  fun arm(at: Instant)

  fun cancel(at: Instant)
}

interface QuietFilter {
  fun allowed(): Boolean

  fun set(on: Boolean)
}

internal class QuietState(val windows: List<BedtimeWindow>, val applied: Boolean, val armed: List<Instant>) {
  fun toJson(): JSONObject = JSONObject()
    .put("windows", JSONArray(windows.map { it.toJson() }))
    .put("applied", applied)
    .put("armed", JSONArray(armed.map { it.toString() }))

  companion object {
    val EMPTY = QuietState(emptyList(), false, emptyList())

    fun of(json: JSONObject): QuietState {
      val armed = json.getJSONArray("armed")
      return QuietState(
        BedtimeWindow.allOf(json.getJSONArray("windows")),
        json.getBoolean("applied"),
        (0 until armed.length()).map { Instant.parse(armed.getString(it)) }
      )
    }
  }
}

class BedtimeQuiet(
  private val preferences: SharedPreferences,
  private val arming: QuietArming,
  private val filter: QuietFilter,
  private val clock: () -> Instant
) {
  fun install(windows: List<BedtimeWindow>): Unit = synchronized(LOCK) {
    val state = load()
    converge(QuietState(windows, state.applied, state.armed))
  }

  fun reconcile(): Unit = synchronized(LOCK) {
    converge(load())
  }

  private fun converge(state: QuietState) {
    val now = clock()
    state.armed.forEach(arming::cancel)
    val applied = applyTo(state.applied, BedtimePlan.wanted(state.windows, now))
    val future = BedtimePlan.steps(state.windows, now).map { it.at }.distinct()
    future.forEach(arming::arm)
    save(QuietState(state.windows, applied, future))
  }

  private fun applyTo(applied: Boolean, wanted: Boolean): Boolean {
    if (applied == wanted) {
      return applied
    }
    if (!filter.allowed()) {
      NativeLog.warn(SCOPE, "quiet.refused") { mapOf("wanted" to wanted) }
      return false
    }
    filter.set(wanted)
    NativeLog.info(SCOPE, "quiet.changed") { mapOf("on" to wanted) }
    return wanted
  }

  private fun load(): QuietState =
    preferences.getString(STATE, null)?.let { QuietState.of(JSONObject(it)) } ?: QuietState.EMPTY

  private fun save(state: QuietState) {
    preferences.edit().putString(STATE, state.toJson().toString()).commit()
  }

  companion object {
    const val PREFERENCES = "expo.modules.healthconnect.planner-bedtime"
    const val ACTION_STEP = "expo.modules.healthconnect.planner.BEDTIME_STEP"
    const val RECEIVER = "expo.modules.healthconnect.planner.BedtimeReceiver"
    private const val STATE = "state"
    private const val SCOPE = "planner-bedtime"
    private val LOCK = Any()

    fun of(context: Context): BedtimeQuiet {
      val app = context.applicationContext
      return BedtimeQuiet(
        app.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE),
        AndroidQuietArming(app),
        AndroidQuietFilter(app),
        Instant::now
      )
    }
  }
}

class AndroidQuietArming(private val context: Context) : QuietArming {
  private val manager = context.getSystemService(AlarmManager::class.java)

  override fun arm(at: Instant) {
    val operation = stepIntent(at, PendingIntent.FLAG_UPDATE_CURRENT) ?: error("no bedtime intent for $at")
    manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toEpochMilli(), operation)
    NativeLog.info("planner-bedtime", "armed") { mapOf("at" to at.toString()) }
  }

  override fun cancel(at: Instant) {
    val existing = stepIntent(at, PendingIntent.FLAG_NO_CREATE) ?: return
    manager.cancel(existing)
    existing.cancel()
  }

  private fun stepIntent(at: Instant, flag: Int): PendingIntent? {
    val intent = Intent(BedtimeQuiet.ACTION_STEP)
      .setComponent(ComponentName(context.packageName, BedtimeQuiet.RECEIVER))
      .setData(Uri.fromParts("bedtime", at.toEpochMilli().toString(), null))
    return PendingIntent.getBroadcast(context, 0, intent, flag or PendingIntent.FLAG_IMMUTABLE)
  }
}

class AndroidQuietFilter(private val context: Context) : QuietFilter {
  private val manager = context.getSystemService(NotificationManager::class.java)

  override fun allowed(): Boolean = manager.isNotificationPolicyAccessGranted

  override fun set(on: Boolean) {
    manager.setInterruptionFilter(
      if (on) NotificationManager.INTERRUPTION_FILTER_ALARMS else NotificationManager.INTERRUPTION_FILTER_ALL
    )
  }
}

class BedtimeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("PlannerBedtimeReceiver") {
      NativeLog.info("planner-bedtime", "reconcile") { mapOf("action" to intent.action) }
      BedtimeQuiet.of(context).reconcile()
    }
  }
}
