package expo.modules.healthconnect.watch

import expo.modules.healthconnect.UnsupportedWatchFamily
import android.content.Context
import android.os.Handler
import expo.modules.healthconnect.watch.xiaomi.XiaomiFamily

enum class WatchPhase(val label: String) {
  PAUSED("paused"),
  WAITING("waiting"),
  CONNECTING("connecting"),
  AUTHENTICATING("authenticating"),
  CONNECTED("connected"),
  FAILED("failed")
}

enum class WatchTransport { SPP, GATT }

class WatchModel(val family: String, val label: String, val transport: WatchTransport)

interface WatchSink {
  fun phase(phase: WatchPhase, detail: String)
  fun battery(level: Int, charging: Boolean?)
  fun worn(worn: Boolean)
  fun device(firmware: String, model: String, serial: String)
  fun live(steps: Int?, heartRate: Int?, activeKcal: Int?)
  fun config(snapshot: WatchConfigSnapshot)
  fun workout(workout: WorkoutInfo)
  fun note(event: String, detail: String)
  fun failed(reason: String, retryable: Boolean)
  fun event(event: WatchEvent)
  fun syncing(detail: String)
  fun synced(files: List<WatchFile>, done: (Set<String>?) -> Unit)
}

interface WatchConnection {
  fun start()
  fun stop()
  fun setLive(on: Boolean)
  fun refresh()
  fun sync(reason: String)
  fun act(action: WatchAction): Boolean
  fun perform(request: WatchRequest, reply: (ActionOutcome) -> Unit)
}

class WatchContext(
  val context: Context,
  val watch: WatchConfig,
  val sink: WatchSink,
  val handler: Handler
) {
  val skippedFiles: MutableSet<String> = SkippedFiles(context, watch.deviceId)
}

interface WatchFamily {
  val id: String
  val label: String
  val vendorApps: List<VendorApp>
  fun recognise(advertisedName: String): WatchModel?
  fun connect(watch: WatchContext): WatchConnection
}

object WatchFamilies {
  private val families: List<WatchFamily> = listOf(XiaomiFamily)

  fun named(id: String): WatchFamily =
    families.firstOrNull { it.id == id } ?: throw UnsupportedWatchFamily(id, families.map { it.id })

  fun recognise(advertisedName: String): WatchModel? =
    families.firstNotNullOfOrNull { it.recognise(advertisedName) }

  fun supported(): List<Map<String, String>> = families.map { mapOf("id" to it.id, "label" to it.label) }
}
