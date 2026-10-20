package expo.modules.healthconnect.treadmill

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import expo.modules.healthconnect.TreadmillBluetoothOff
import expo.modules.healthconnect.TreadmillDumpFailed
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout

class Candidate(val name: String, val address: String, val rssi: Int, val services: List<String>) {
  fun toMap(): Map<String, Any?> = mapOf("name" to name, "address" to address, "rssi" to rssi, "services" to services)
}

@SuppressLint("MissingPermission")
class TreadmillScan(private val context: Context, private val onFound: (Candidate) -> Unit) {
  private var callback: ScanCallback? = null

  fun start() {
    stop()
    val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
      ?: throw TreadmillBluetoothOff()
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
    val name = result.scanRecord?.deviceName ?: result.device.name ?: return null
    val services = result.scanRecord?.serviceUuids.orEmpty().map { GattUuid.short(it.uuid) }
    val named = NAME_PREFIXES.any { name.startsWith(it) }
    if (!named && SERVICES.none { it in services }) return null
    return Candidate(name, result.device.address.uppercase(), result.rssi, services)
  }

  private companion object {
    val NAME_PREFIXES = listOf("KS-", "WalkingPad", "KINGSMITH", "ZP-ZEALR1", "DYNAMAX", "HW-KS-")
    val SERVICES = listOf("fe00", "1826")
  }
}

@SuppressLint("MissingPermission")
class TreadmillDumper(private val context: Context) {
  suspend fun dump(address: String, name: String): GattDump = withTimeout(TIMEOUT_MS) {
    suspendCancellableCoroutine { continuation ->
      val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
      if (adapter == null || !adapter.isEnabled) {
        continuation.resumeWithException(TreadmillBluetoothOff())
        return@suspendCancellableCoroutine
      }
      val reader = Reader(name, { continuation.resume(it) }, { continuation.resumeWithException(TreadmillDumpFailed(it)) })
      val gatt = adapter.getRemoteDevice(address).connectGatt(context, false, reader, BluetoothDevice.TRANSPORT_LE)
      continuation.invokeOnCancellation { gatt.close() }
    }
  }

  private class Reader(
    private val name: String,
    private val done: (GattDump) -> Unit,
    private val failed: (String) -> Unit
  ) : BluetoothGattCallback() {
    private val toRead = ArrayDeque<BluetoothGattCharacteristic>()
    private val values = HashMap<String, String>()
    private var finished = false

    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        gatt.discoverServices()
      } else if (!finished && (newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS)) {
        end(gatt) { failed("the connection ended with status $status; close KS Fit on every phone and try again") }
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        end(gatt) { failed("the services could not be listed (status $status)") }
        return
      }
      gatt.services.filter { GattUuid.short(it.uuid) in READABLE }.forEach { service ->
        service.characteristics
          .filter { it.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0 }
          .forEach { toRead.addLast(it) }
      }
      next(gatt)
    }

    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
      remember(characteristic, value, status)
      next(gatt)
    }

    @Deprecated("Replaced by the version that carries the value on Android 13")
    override fun onCharacteristicRead(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      @Suppress("DEPRECATION")
      remember(characteristic, characteristic.value ?: ByteArray(0), status)
      next(gatt)
    }

    private fun remember(characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) values[key(characteristic)] = TreadmillHex.of(value)
    }

    private fun key(characteristic: BluetoothGattCharacteristic): String =
      "${GattUuid.short(characteristic.service.uuid)}/${GattUuid.short(characteristic.uuid)}"

    private fun next(gatt: BluetoothGatt) {
      val characteristic = toRead.removeFirstOrNull()
      if (characteristic == null) {
        end(gatt) { done(dump(gatt)) }
        return
      }
      if (!gatt.readCharacteristic(characteristic)) next(gatt)
    }

    private fun dump(gatt: BluetoothGatt): GattDump = GattDump(
      name,
      gatt.services.map { service ->
        GattServiceDump(
          GattUuid.short(service.uuid),
          service.characteristics.map { characteristic ->
            GattCharacteristicDump(GattUuid.short(characteristic.uuid), propertiesOf(characteristic.properties), values[key(characteristic)])
          }
        )
      }
    )

    private fun propertiesOf(flags: Int): List<String> = buildList {
      if (flags and BluetoothGattCharacteristic.PROPERTY_READ != 0) add("read")
      if (flags and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) add("write")
      if (flags and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) add("write_no_response")
      if (flags and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) add("notify")
      if (flags and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) add("indicate")
    }

    private fun end(gatt: BluetoothGatt, report: () -> Unit) {
      if (finished) return
      finished = true
      report()
      gatt.close()
    }
  }

  private companion object {
    const val TIMEOUT_MS = 30_000L
    val READABLE = setOf("1800", "180a", "1826")
  }
}
