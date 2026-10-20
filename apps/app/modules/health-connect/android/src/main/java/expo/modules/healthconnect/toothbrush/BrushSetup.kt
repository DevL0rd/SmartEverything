package expo.modules.healthconnect.toothbrush

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import expo.modules.healthconnect.BrushBluetoothOff
import expo.modules.healthconnect.BrushBondFailed
import expo.modules.healthconnect.toHex
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

class Candidate(
  val name: String,
  val address: String,
  val rssi: Int,
  val brand: String,
  val stack: String,
  val advert: String?
) {
  fun toMap(): Map<String, Any?> =
    mapOf("name" to name, "address" to address, "rssi" to rssi, "brand" to brand, "stack" to stack, "advert" to advert)
}

@SuppressLint("MissingPermission")
class BrushScan(
  private val context: Context,
  private val brands: Set<String>,
  private val onFound: (Candidate) -> Unit
) {
  private var callback: ScanCallback? = null

  fun start() {
    stop()
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
      ?: throw BrushBluetoothOff()
    val found = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        candidateOf(result)?.let(onFound)
      }
    }
    callback = found
    scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), found)
  }

  fun stop() {
    val found = callback ?: return
    callback = null
    context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(found)
  }

  private fun candidateOf(result: ScanResult): Candidate? {
    val record = result.scanRecord ?: return null
    val manufacturer = HashMap<Int, ByteArray>()
    record.manufacturerSpecificData?.let { data ->
      for (index in 0 until data.size()) manufacturer[data.keyAt(index)] = data.valueAt(index)
    }
    val services = record.serviceUuids.orEmpty().map { it.uuid.toString().lowercase() }.toSet()
    val kind = BrushKinds.kindOf(services, manufacturer) ?: return null
    if (brands.isNotEmpty() && kind.brand !in brands) return null
    val name = record.deviceName ?: result.device.name ?: if (kind.brand == BrushKinds.ORALB) "Oral-B" else "Philips Sonicare"
    val advert = manufacturer[BrushKinds.ORALB_COMPANY_ID]?.takeIf { kind.brand == BrushKinds.ORALB }?.toHex()
    return Candidate(name, result.device.address.uppercase(), result.rssi, kind.brand, kind.stack, advert)
  }
}

@SuppressLint("MissingPermission")
object BrushBond {
  private const val TIMEOUT_MS = 60_000L

  fun bonded(context: Context, address: String): Boolean {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return false
    return adapter.getRemoteDevice(address).bondState == BluetoothDevice.BOND_BONDED
  }

  suspend fun bond(context: Context, address: String): Boolean {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    if (adapter == null || !adapter.isEnabled) throw BrushBluetoothOff()
    val device = adapter.getRemoteDevice(address)
    if (device.bondState == BluetoothDevice.BOND_BONDED) return true
    return withTimeout(TIMEOUT_MS) {
      suspendCancellableCoroutine { continuation ->
        val receiver = object : BroadcastReceiver() {
          override fun onReceive(received: Context, intent: Intent) {
            val changed = bondedDevice(intent) ?: return
            if (!changed.address.equals(address, ignoreCase = true)) return
            val state = intent.getIntExtra(BluetoothDevice.EXTRA_BOND_STATE, BluetoothDevice.BOND_NONE)
            if (state == BluetoothDevice.BOND_BONDED) {
              context.unregisterReceiver(this)
              continuation.resume(true)
            } else if (state == BluetoothDevice.BOND_NONE) {
              context.unregisterReceiver(this)
              continuation.resumeWithException(BrushBondFailed("the brush refused the pairing; forget it in Bluetooth settings and try again"))
            }
          }
        }
        context.registerReceiver(receiver, IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED))
        continuation.invokeOnCancellation { context.unregisterReceiver(receiver) }
        if (!device.createBond()) {
          context.unregisterReceiver(receiver)
          continuation.resumeWithException(BrushBondFailed("Android did not start the pairing"))
        }
      }
    }
  }

  private fun bondedDevice(intent: Intent): BluetoothDevice? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }
}

