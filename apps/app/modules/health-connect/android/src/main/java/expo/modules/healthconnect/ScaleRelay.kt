package expo.modules.healthconnect

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent

class BluetoothScanNotAllowed : SyncFailure(
  "Listening for the scale needs the Nearby devices permission, which is not granted",
  retryable = false
)

class BluetoothUnavailable : SyncFailure(
  "This phone's Bluetooth is off or missing, so it cannot listen for the scale",
  retryable = false
)

class ServerNotConfigured : SyncFailure(
  "This phone has no server connection yet; open the app once so it can pass it on",
  retryable = false
)

fun relayTarget(context: Context): IngestTarget = Credentials(context, CredentialSlot.SERVER).load()

fun configureServer(context: Context, serverUrl: String, token: String, enrollment: String) {
  Credentials(context, CredentialSlot.SERVER).save(IngestTarget(serverUrl.trimEnd('/') + ScaleRelay.API_BASE, token), enrollment)
}

class ScaleRelay(private val context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val status = ScaleStatus(context)

  suspend fun start(): Int {
    val devices = HubClient(relayTarget(context)).get<BleWatch>(WATCH_PATH).devices
    preferences.edit().putString(WATCHED, HubJson.encode(devices)).apply()
    ScaleAdverts.resume(context)
    register(devices)
    return devices.size
  }

  fun resume() {
    ScaleAdverts.resume(context)
    register(watched())
  }

  @SuppressLint("MissingPermission")
  fun stop() {
    preferences.edit().remove(WATCHED).apply()
    scanner()?.stopScan(pendingIntent(context))
    stopLive()
  }

  fun watched(): List<WatchedDevice> {
    val stored = preferences.getString(WATCHED, null) ?: return emptyList()
    return HubJson.decode(stored)
  }

  @SuppressLint("MissingPermission")
  fun startLive() {
    val devices = watched()
    val scanner = ready()
    if (devices.isEmpty()) {
      return
    }
    live?.let { scanner.stopScan(it) }
    val callback = LiveCallback(context.applicationContext)
    live = callback
    scanner.startScan(devices.map { it.filter() }, settings(ScanSettings.SCAN_MODE_LOW_LATENCY), callback)
    status.note("live_started", "${devices.size} Bluetooth device(s)")
  }

  @SuppressLint("MissingPermission")
  fun stopLive() {
    val callback = live ?: return
    live = null
    scanner()?.stopScan(callback)
    status.note("live_stopped", "")
  }

  @SuppressLint("MissingPermission")
  private fun register(devices: List<WatchedDevice>) {
    val scanner = ready()
    scanner.stopScan(pendingIntent(context))
    if (devices.isEmpty()) {
      status.note("registered", "no Bluetooth devices to listen for")
      return
    }
    val code = scanner.startScan(devices.map { it.filter() }, settings(ScanSettings.SCAN_MODE_BALANCED), pendingIntent(context))
    if (code != 0) {
      status.note("failed", "Android refused the background scan with code $code")
      return
    }
    status.note("registered", "${devices.size} Bluetooth device(s) in the background")
  }

  private fun ready(): BluetoothLeScanner {
    if (!ScaleStatus.permitted(context)) {
      status.note("failed", "Nearby devices permission missing")
      throw BluetoothScanNotAllowed()
    }
    return scanner() ?: run {
      status.note("failed", "Bluetooth is off")
      throw BluetoothUnavailable()
    }
  }

  private fun settings(mode: Int): ScanSettings = ScanSettings.Builder()
    .setScanMode(mode)
    .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
    .build()

  private fun scanner() = context.getSystemService(BluetoothManager::class.java)
    ?.adapter
    ?.takeIf { it.isEnabled }
    ?.bluetoothLeScanner

  private class LiveCallback(private val context: Context) : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      ScaleAdverts.relay(context, listOf(result))
    }

    override fun onBatchScanResults(results: MutableList<ScanResult>) {
      ScaleAdverts.relay(context, results)
    }

    override fun onScanFailed(errorCode: Int) {
      ScaleStatus(context).note("failed", "The live scan stopped with error $errorCode")
    }
  }

  companion object {
    const val API_BASE = "/api/ble/"
    const val WATCH_PATH = "/api/ble/watch"
    const val ADVERTS_PATH = "/api/ble/adverts"
    private const val PREFERENCES = "expo.modules.healthconnect.scale"
    private const val WATCHED = "watched"
    private const val REQUEST_CODE = 7400
    private var live: ScanCallback? = null

    fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      Intent(context, ScaleAdvertReceiver::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )
  }
}
