package expo.modules.healthconnect

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.Intent
import android.os.ParcelUuid
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class WatchedDevice(val address: String, val serviceUuid: String, val prefix: ByteArray, val mask: ByteArray) {
  fun toJson(): JSONObject = jsonOf(
    "address" to address,
    "serviceUuid" to serviceUuid,
    "dataPrefix" to prefix.toHex(),
    "dataMask" to mask.toHex()
  )

  fun filter(): ScanFilter = ScanFilter.Builder()
    .setServiceData(ParcelUuid(UUID.fromString(serviceUuid)), prefix, mask)
    .build()

  companion object {
    fun of(json: JSONObject) = WatchedDevice(
      json.getString("address").uppercase(),
      json.getString("serviceUuid"),
      json.getString("dataPrefix").fromHex(),
      json.getString("dataMask").fromHex()
    )
  }
}

fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

fun String.fromHex(): ByteArray = chunked(2).map { it.toInt(16).toByte() }.toByteArray()

class BluetoothScanNotAllowed : SyncFailure(
  "Listening for the scale needs the Nearby devices permission, which is not granted",
  retryable = false
)

class BluetoothUnavailable : SyncFailure(
  "This phone's Bluetooth is off or missing, so it cannot listen for the scale",
  retryable = false
)

class ScaleRelayNotConfigured : SyncFailure(
  "The scale relay has no server connection yet; open the app once so it can pass it on",
  retryable = false
)

fun relayTarget(context: Context): IngestTarget = Credentials(context, CredentialSlot.SERVER).load()

fun configureServer(context: Context, serverUrl: String, token: String, enrollment: String) {
  Credentials(context, CredentialSlot.SERVER).save(IngestTarget(serverUrl.trimEnd('/') + ScaleRelay.API_BASE, token), enrollment)
}

class ScaleRelay(private val context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val status = ScaleStatus(context)

  fun configure(serverUrl: String, token: String, enrollment: String) = configureServer(context, serverUrl, token, enrollment)

  suspend fun start(): Int {
    val answer = HubClient(relayTarget(context)).get(WATCH_PATH).getJSONArray("devices")
    val devices = (0 until answer.length()).map { WatchedDevice.of(answer.getJSONObject(it)) }
    preferences.edit().putString(WATCHED, JSONArray(devices.map { it.toJson() }).toString()).apply()
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
    val array = JSONArray(stored)
    return (0 until array.length()).map { WatchedDevice.of(array.getJSONObject(it)) }
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
    const val WATCH_PATH = "watch"
    const val ADVERTS_PATH = "adverts"
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
