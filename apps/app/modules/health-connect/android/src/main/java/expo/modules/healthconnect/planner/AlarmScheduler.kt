package expo.modules.healthconnect.planner

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.work.WorkManager
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.phone.PhonePostWorker
import java.time.Instant
import java.time.ZoneId
import org.json.JSONObject

interface AlarmArming {
  fun arm(ring: PhoneRing, at: Instant)

  fun cancel(ringKey: String)
}

interface RingReports {
  fun acknowledge(clientId: String, hash: String)

  fun missed(clientId: String, ring: PhoneRing, dueAt: Instant)
}

class AlarmScheduler(
  private val store: RingStore,
  private val arming: AlarmArming,
  private val reports: RingReports,
  private val zone: () -> ZoneId,
  private val clock: () -> Instant
) {
  fun install(set: RingSet, clientId: String) = synchronized(LOCK) {
    val before = store.load()
    val unchanged = set.rings.filter { ring -> before.rings.any { it == ring } }.map { it.ringKey }.toSet()
    val keys = set.rings.map { it.ringKey }.toSet()
    before.rings.map { it.ringKey }.filter { it !in keys }.forEach { cancelAll(it) }
    val state = RingState(
      clientId,
      set.hash,
      set.rings,
      before.armed.filterKeys { it in unchanged },
      before.settled.filter { it in unchanged }.toSet()
    )
    store.save(reconcile(state, reportOverdue = false))
    reports.acknowledge(clientId, set.hash)
  }

  fun ringOf(ringKey: String): PhoneRing? = store.load().rings.firstOrNull { it.ringKey == ringKey }

  fun snooze(ring: PhoneRing, minutes: Int) = synchronized(LOCK) {
    arming.arm(RingSnooze.ringOf(ring, clock(), minutes), clock().plusSeconds(minutes * SECONDS_PER_MINUTE))
  }

  fun cancelSnooze(ringKey: String) = synchronized(LOCK) {
    arming.cancel(RingKeys.snoozeOf(ringKey))
  }

  private fun cancelAll(ringKey: String) {
    arming.cancel(ringKey)
    arming.cancel(RingKeys.snoozeOf(ringKey))
  }

  fun rearm() = synchronized(LOCK) {
    store.save(reconcile(store.load(), reportOverdue = true))
  }

  fun fired(ringKey: String) = synchronized(LOCK) {
    val state = store.load()
    val ring = state.rings.firstOrNull { it.ringKey == ringKey } ?: return@synchronized
    val settled = if (ring.repeats) state.settled else state.settled + ringKey
    val next = RingState(state.clientId, state.hash, state.rings, state.armed - ringKey, settled)
    store.save(reconcile(next, reportOverdue = false))
  }

  private fun reconcile(state: RingState, reportOverdue: Boolean): RingState {
    val now = clock()
    return state.rings.fold(state) { current, ring -> settle(current, ring, now, reportOverdue) }
  }

  private fun settle(state: RingState, ring: PhoneRing, now: Instant, reportOverdue: Boolean): RingState {
    val key = ring.ringKey
    if (key in state.settled) {
      arming.cancel(key)
      return state
    }
    val armedAt = state.armed[key]?.let(Instant::ofEpochMilli)
    val overdueAt = armedAt?.takeIf { !it.isAfter(now) }
    if (overdueAt != null && reportOverdue) {
      state.clientId?.let { reports.missed(it, ring, overdueAt) }
    }
    val spent = overdueAt != null && !ring.repeats
    val next = if (spent) null else NextTrigger.of(ring, now, zone())
    val settled = if (spent) state.settled + key else state.settled
    return RingState(state.clientId, state.hash, state.rings, rearmed(state.armed, ring, armedAt, next), settled)
  }

  private fun rearmed(armed: Map<String, Long>, ring: PhoneRing, armedAt: Instant?, next: Instant?): Map<String, Long> {
    if (next == null) {
      arming.cancel(ring.ringKey)
      return armed - ring.ringKey
    }
    if (next != armedAt) {
      arming.arm(ring, next)
    }
    return armed + (ring.ringKey to next.toEpochMilli())
  }

  companion object {
    const val RING_SERVICE = "expo.modules.healthconnect.planner.RingService"
    const val ACTION_RING = "expo.modules.healthconnect.planner.RING"
    const val EXTRA_RING_KEY = "ringKey"
    const val ACK_PATH = "/api/planner/phone-rings/ack"
    const val MISSED_PATH = "/api/planner/phone-rings/missed"
    const val MISSED_REASON = "phone_off"
    private const val SECONDS_PER_MINUTE = 60L
    private val LOCK = Any()

    fun of(context: Context): AlarmScheduler {
      val app = context.applicationContext
      return AlarmScheduler(
        RingStore(app.getSharedPreferences(RingStore.PREFERENCES, Context.MODE_PRIVATE)),
        AndroidAlarmArming(app),
        HubRingReports(app),
        ZoneId::systemDefault,
        Instant::now
      )
    }
  }
}

class AndroidAlarmArming(private val context: Context) : AlarmArming {
  private val manager = context.getSystemService(AlarmManager::class.java)

  override fun arm(ring: PhoneRing, at: Instant) {
    val show = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: error("${context.packageName} has no launcher activity to show for its alarm")
    val info = AlarmManager.AlarmClockInfo(
      at.toEpochMilli(),
      PendingIntent.getActivity(context, 0, show, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    )
    val operation = ringIntent(ring.ringKey, PendingIntent.FLAG_UPDATE_CURRENT) ?: error("no ring intent for ${ring.ringKey}")
    manager.setAlarmClock(info, operation)
    NativeLog.info("planner-alarm", "armed") { mapOf("kind" to ring.kind.wire, "at" to at.toString()) }
  }

  override fun cancel(ringKey: String) {
    val existing = ringIntent(ringKey, PendingIntent.FLAG_NO_CREATE) ?: return
    manager.cancel(existing)
    existing.cancel()
  }

  private fun ringIntent(ringKey: String, flag: Int): PendingIntent? {
    val intent = Intent(AlarmScheduler.ACTION_RING)
      .setComponent(ComponentName(context.packageName, AlarmScheduler.RING_SERVICE))
      .setData(Uri.fromParts("ring", ringKey, null))
      .putExtra(AlarmScheduler.EXTRA_RING_KEY, ringKey)
    return PendingIntent.getForegroundService(context, 0, intent, flag or PendingIntent.FLAG_IMMUTABLE)
  }
}

class HubRingReports(private val context: Context) : RingReports {
  override fun acknowledge(clientId: String, hash: String) {
    enqueue(AlarmScheduler.ACK_PATH, JSONObject().put("clientId", clientId).put("hash", hash))
  }

  override fun missed(clientId: String, ring: PhoneRing, dueAt: Instant) {
    enqueue(
      AlarmScheduler.MISSED_PATH,
      JSONObject()
        .put("clientId", clientId)
        .put("ringKey", ring.ringKey)
        .put("kind", ring.kind.wire)
        .put("refId", ring.refId)
        .put("dueAt", dueAt.toString())
        .put("reason", AlarmScheduler.MISSED_REASON)
    )
  }

  private fun enqueue(path: String, body: JSONObject) {
    WorkManager.getInstance(context).enqueue(PhonePostWorker.request(path, body))
  }
}
