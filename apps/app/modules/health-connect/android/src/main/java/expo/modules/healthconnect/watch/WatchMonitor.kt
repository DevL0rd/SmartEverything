package expo.modules.healthconnect.watch

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.NativeEventChannel
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.jsonOf
import expo.modules.healthconnect.relayTarget
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

object WatchEvents : NativeEventChannel()

data class WatchSnapshot(
  val deviceId: String,
  val name: String,
  val phase: WatchPhase = WatchPhase.WAITING,
  val detail: String = "",
  val battery: Int? = null,
  val charging: Boolean? = null,
  val worn: Boolean? = null,
  val firmware: String? = null,
  val model: String? = null,
  val steps: Int? = null,
  val heartRate: Int? = null,
  val activeKcal: Int? = null,
  val config: WatchConfigSnapshot? = null,
  val workout: WorkoutInfo? = null,
  val error: String? = null,
  val connectedAt: String? = null,
  val syncing: Boolean = false,
  val syncDetail: String? = null,
  val syncError: String? = null,
  val lastSyncAt: String? = null,
  val updatedAt: String = Instant.now().toString()
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "deviceId" to deviceId,
    "name" to name,
    "phase" to phase.label,
    "detail" to detail,
    "battery" to battery,
    "charging" to charging,
    "worn" to worn,
    "firmware" to firmware,
    "model" to model,
    "steps" to steps,
    "heartRate" to heartRate,
    "activeKcal" to activeKcal,
    "configJson" to config?.toJson()?.toString(),
    "workoutJson" to workout?.toJson()?.toString(),
    "error" to error,
    "connectedAt" to connectedAt,
    "syncing" to syncing,
    "syncDetail" to syncDetail,
    "syncError" to syncError,
    "lastSyncAt" to lastSyncAt,
    "updatedAt" to updatedAt
  )
}

object WatchSnapshots {
  private val current = ConcurrentHashMap<String, WatchSnapshot>()

  fun of(watch: WatchConfig): WatchSnapshot = current[watch.deviceId] ?: WatchSnapshot(watch.deviceId, watch.name)

  fun put(snapshot: WatchSnapshot) {
    current[snapshot.deviceId] = snapshot
  }

  fun all(watches: List<WatchConfig>): List<Map<String, Any?>> = watches.map { of(it).toMap() }
}

class WatchMonitor(
  private val context: Context,
  private val watch: WatchConfig,
  private val scope: CoroutineScope,
  private val onChange: (WatchSnapshot) -> Unit,
  private val onFailure: (String, Boolean) -> Unit
) : WatchSink {
  private var lastReportAt = 0L
  private var lastHeartRateAt = 0L
  private var lastWorkoutReportAt = 0L

  override fun phase(phase: WatchPhase, detail: String) {
    val previous = WatchSnapshots.of(watch)
    if (previous.phase == phase && previous.detail == detail) {
      return
    }
    val connected = phase == WatchPhase.CONNECTED
    update("phase_${phase.label}", detail, report = true) {
      copy(
        phase = phase,
        detail = detail,
        error = if (connected) null else error,
        connectedAt = if (connected) Instant.now().toString() else connectedAt
      )
    }
  }

  override fun battery(level: Int, charging: Boolean?) {
    val previous = WatchSnapshots.of(watch)
    val changed = previous.battery != level || (charging != null && previous.charging != charging)
    if (!changed) {
      return
    }
    update("battery", "$level%${if (charging == true) ", charging" else ""}", report = changed) {
      copy(battery = level, charging = charging ?: this.charging)
    }
  }

  override fun worn(worn: Boolean) {
    if (!worn && System.currentTimeMillis() - lastHeartRateAt < HEART_RATE_PROVES_WORN_MS) {
      note("worn_ignored", "the watch reported off the wrist, but it measured a heart rate in the last 2 minutes")
      return
    }
    if (WatchSnapshots.of(watch).worn == worn) {
      return
    }
    update("worn", if (worn) "on the wrist" else "off the wrist", report = true) { copy(worn = worn) }
  }

  override fun device(firmware: String, model: String, serial: String) =
    update("device_info", "firmware $firmware, model $model", report = true) {
      copy(firmware = firmware, model = model)
    }

  override fun live(steps: Int?, heartRate: Int?, activeKcal: Int?) {
    val previous = WatchSnapshots.of(watch)
    val same = (steps == null || steps == previous.steps) &&
      (heartRate == null || heartRate == previous.heartRate) &&
      (activeKcal == null || activeKcal == previous.activeKcal)
    if (same) {
      return
    }
    if (heartRate != null && heartRate > 0) {
      lastHeartRateAt = System.currentTimeMillis()
      if (previous.worn != true) {
        update("worn", "on the wrist (heart rate $heartRate bpm)", report = true) { copy(worn = true) }
      }
    }
    val due = System.currentTimeMillis() - lastReportAt > LIVE_REPORT_MS
    update("live", "steps ${steps ?: "-"}, heart rate ${heartRate ?: "-"}, ${activeKcal ?: "-"} kcal", report = due) {
      copy(steps = steps ?: this.steps, heartRate = heartRate ?: this.heartRate, activeKcal = activeKcal ?: this.activeKcal)
    }
  }

  override fun config(snapshot: WatchConfigSnapshot) {
    val text = snapshot.toJson().toString()
    if (WatchSnapshots.of(watch).config?.toJson()?.toString() == text) {
      return
    }
    update("config", "${snapshot.settings.size} settings, ${snapshot.alarms.size} alarms, ${snapshot.faces.size} faces", report = true) {
      copy(config = snapshot)
    }
  }

  override fun workout(workout: WorkoutInfo) {
    val previous = WatchSnapshots.of(watch).workout
    val now = System.currentTimeMillis()
    val due = previous?.state != workout.state || now - lastWorkoutReportAt > WORKOUT_REPORT_MS
    if (due) {
      lastWorkoutReportAt = now
    }
    val figures = "hr ${workout.heartRate ?: "-"}, ${workout.kcal ?: "-"} kcal, ${workout.steps ?: "-"} steps"
    update("workout", "${workout.sport} ${workout.state.label}: $figures", report = due) { copy(workout = workout) }
  }

  override fun note(event: String, detail: String) {
    Log.i(TAG, "${watch.name} $event: $detail")
    WatchEvents.emit(event, detail, mapOf("deviceId" to watch.deviceId))
  }

  override fun failed(reason: String, retryable: Boolean) {
    update("failed", reason, report = true) {
      copy(phase = WatchPhase.FAILED, detail = reason, error = reason)
    }
    onFailure(reason, retryable)
  }

  override fun event(event: WatchEvent) = PhoneEvents.handle(context, event)

  override fun syncing(detail: String) = update("sync_started", detail, report = false) {
    copy(syncing = true, syncDetail = detail)
  }

  override fun synced(files: List<WatchFile>, done: (Set<String>?) -> Unit) {
    scope.launch {
      val keep = try {
        val outcome = WatchUpload.upload(context, watch.deviceId, files)
        update("sync_finished", outcome.text, report = true) {
          copy(syncing = false, syncDetail = outcome.text, syncError = null, lastSyncAt = Instant.now().toString())
        }
        outcome.keep
      } catch (failure: SyncFailure) {
        val reason = "Saving the watch data failed: ${failure.message}; it stays on the watch for the next sync"
        update("sync_failed", reason, report = true) { copy(syncing = false, syncDetail = null, syncError = reason) }
        null
      }
      done(keep)
    }
  }

  fun paused() = update("phase_paused", PAUSED_TEXT, report = true) {
    copy(phase = WatchPhase.PAUSED, detail = PAUSED_TEXT, error = null)
  }

  private fun update(event: String, detail: String, report: Boolean, change: WatchSnapshot.() -> WatchSnapshot) {
    val next = WatchSnapshots.of(watch).change().copy(updatedAt = Instant.now().toString())
    WatchSnapshots.put(next)
    WatchEvents.emit(event, detail, next.toMap())
    if (event == "failed" || event == "sync_failed") Log.w(TAG, "${watch.name} $event: $detail") else Log.i(TAG, "${watch.name} $event: $detail")
    onChange(next)
    if (report) {
      report(next)
    }
  }

  private fun report(snapshot: WatchSnapshot) {
    lastReportAt = System.currentTimeMillis()
    scope.launch {
      try {
        HubClient(relayTarget(context)).post("/api/watches/${watch.deviceId}/state", stateJson(snapshot))
      } catch (failure: SyncFailure) {
        WatchEvents.emit("report_failed", failure.message.orEmpty(), mapOf("deviceId" to watch.deviceId))
      }
    }
  }

  private fun stateJson(snapshot: WatchSnapshot) = jsonOf(
    "phase" to snapshot.phase.label,
    "battery" to snapshot.battery,
    "charging" to snapshot.charging,
    "worn" to snapshot.worn,
    "firmware" to snapshot.firmware?.take(FIRMWARE_LIMIT),
    "steps" to snapshot.steps,
    "heartRate" to snapshot.heartRate,
    "lastSyncAt" to snapshot.lastSyncAt,
    "error" to (snapshot.error ?: snapshot.syncError)?.take(ERROR_LIMIT),
    "at" to snapshot.updatedAt
  ).also { json ->
    snapshot.config?.let { json.put("config", it.toJson()) }
    snapshot.workout?.let { json.put("workout", it.toJson()) }
  }

  private companion object {
    const val TAG = "SmartEverythingWatch"
    const val HEART_RATE_PROVES_WORN_MS = 120_000L
    const val PAUSED_TEXT = "Paused so Mi Fitness can use the watch"
    const val LIVE_REPORT_MS = 5 * 60_000L
    const val WORKOUT_REPORT_MS = 15_000L
    const val FIRMWARE_LIMIT = 80
    const val ERROR_LIMIT = 400
  }
}
