package expo.modules.healthconnect.larq

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.ParcelUuid
import expo.modules.healthconnect.LarqBluetoothOff
import expo.modules.healthconnect.LarqScanNotAllowed
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.SyncFailure
import java.util.UUID
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

class LarqCandidate(val name: String, val serial: String, val address: String, val rssi: Int) {
  fun toMap(): Map<String, Any?> = mapOf("name" to name, "serial" to serial, "address" to address, "rssi" to rssi)
}

object LarqPermissions {
  fun scanAllowed(context: Context): Boolean = allowed(context, android.Manifest.permission.BLUETOOTH_SCAN)

  fun connectAllowed(context: Context): Boolean = allowed(context, android.Manifest.permission.BLUETOOTH_CONNECT)

  private fun allowed(context: Context, permission: String): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      context.checkSelfPermission(permission) == android.content.pm.PackageManager.PERMISSION_GRANTED
}

object LarqScan {
  private const val REQUEST_CODE = 7410
  private val SERVICE = ParcelUuid(UUID.fromString("0000180a-0000-1000-8000-00805f9b34fb"))

  fun candidateOf(result: ScanResult): LarqCandidate? {
    val name = result.scanRecord?.deviceName ?: return null
    val serial = LarqFrames.serialOfName(name) ?: return null
    if (result.scanRecord?.serviceUuids?.contains(SERVICE) != true) return null
    return LarqCandidate(name, serial, result.device.address.uppercase(), result.rssi)
  }

  fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(context, LarqScanReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
  )

  fun scanner(context: Context): BluetoothLeScanner? =
    context.getSystemService(BluetoothManager::class.java)?.adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner

  fun filters(): List<ScanFilter> = listOf(ScanFilter.Builder().setServiceUuid(SERVICE).build())

  fun settings(mode: Int): ScanSettings = ScanSettings.Builder()
    .setScanMode(mode)
    .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
    .build()

  private fun appearances(mode: Int): ScanSettings = ScanSettings.Builder()
    .setScanMode(mode)
    .setCallbackType(ScanSettings.CALLBACK_TYPE_FIRST_MATCH or ScanSettings.CALLBACK_TYPE_MATCH_LOST)
    .build()

  @SuppressLint("MissingPermission")
  fun register(context: Context, bottles: List<PhoneBottle>) {
    if (!LarqPermissions.scanAllowed(context)) throw LarqScanNotAllowed()
    val scanner = scanner(context) ?: throw LarqBluetoothOff()
    scanner.stopScan(pendingIntent(context))
    if (bottles.isEmpty()) return
    scanner.startScan(filters(), appearances(ScanSettings.SCAN_MODE_BALANCED), pendingIntent(context))
  }

  fun unregister(context: Context) {
    if (!LarqPermissions.scanAllowed(context)) return
    @SuppressLint("MissingPermission")
    scanner(context)?.stopScan(pendingIntent(context))
  }
}

@SuppressLint("MissingPermission")
class LarqSetupScan(private val context: Context, private val onFound: (LarqCandidate) -> Unit) {
  private var callback: ScanCallback? = null

  fun start() {
    stop()
    val scanner = LarqScan.scanner(context) ?: throw LarqBluetoothOff()
    val found = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        LarqScan.candidateOf(result)?.let(onFound)
      }
    }
    callback = found
    scanner.startScan(LarqScan.filters(), LarqScan.settings(ScanSettings.SCAN_MODE_LOW_LATENCY), found)
  }

  fun stop() {
    val found = callback ?: return
    callback = null
    LarqScan.scanner(context)?.stopScan(found)
  }
}

object LarqFinder {
  @SuppressLint("MissingPermission")
  suspend fun find(context: Context, serial: String, milliseconds: Long): String? {
    if (!LarqPermissions.scanAllowed(context)) return null
    val scanner = LarqScan.scanner(context) ?: return null
    return withTimeoutOrNull(milliseconds) {
      suspendCancellableCoroutine { continuation ->
        val callback = object : ScanCallback() {
          override fun onScanResult(callbackType: Int, result: ScanResult) {
            val found = LarqScan.candidateOf(result)
            if (found != null && found.serial.equals(serial, ignoreCase = true) && continuation.isActive) {
              continuation.resumeWith(Result.success(found.address))
            }
          }
        }
        scanner.startScan(LarqScan.filters(), LarqScan.settings(ScanSettings.SCAN_MODE_LOW_LATENCY), callback)
        continuation.invokeOnCancellation { scanner.stopScan(callback) }
      }
    }
  }
}

class LarqScanReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("LarqScanReceiver") {
    if (intent.getIntExtra(BluetoothLeScanner.EXTRA_ERROR_CODE, NO_ERROR) != NO_ERROR) return@run
    if (intent.getIntExtra(BluetoothLeScanner.EXTRA_CALLBACK_TYPE, ScanSettings.CALLBACK_TYPE_ALL_MATCHES) != ScanSettings.CALLBACK_TYPE_FIRST_MATCH) return@run
    LarqSync.heard(context, resultsOf(intent).mapNotNull(LarqScan::candidateOf))
  }

  private fun resultsOf(intent: Intent): List<ScanResult> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT, ScanResult::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableArrayListExtra(BluetoothLeScanner.EXTRA_LIST_SCAN_RESULT)
    }.orEmpty()

  private companion object {
    const val NO_ERROR = 0
  }
}

class LarqRestart : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("LarqRestart") {
      try {
        LarqScan.register(context, LarqStore(context).bottles())
      } catch (failure: SyncFailure) {
        android.util.Log.w("SmartEverythingLarq", "Listening for the bottle did not restart: ${failure.message}")
      }
    }
  }
}
