package expo.modules.healthconnect.toothbrush

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.BrushBluetoothOff
import expo.modules.healthconnect.BrushDumpFailed
import expo.modules.healthconnect.toHex
import expo.modules.healthconnect.treadmill.GattCharacteristicDump
import expo.modules.healthconnect.treadmill.GattDump
import expo.modules.healthconnect.treadmill.GattServiceDump
import expo.modules.healthconnect.treadmill.GattUuid
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.Serializable

@Serializable
class BrushDump(val gatt: GattDump, val bonded: Boolean)

@SuppressLint("MissingPermission")
class BrushDumper(private val context: Context) {
  suspend fun dump(address: String, name: String, brand: String): String = withTimeout(TIMEOUT_MS) {
    suspendCancellableCoroutine { continuation ->
      val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
      if (adapter == null || !adapter.isEnabled) {
        continuation.resumeWithException(BrushBluetoothOff())
        return@suspendCancellableCoroutine
      }
      val device = adapter.getRemoteDevice(address)
      val reader = Reader(
        name,
        brand,
        { continuation.resume(HubJson.encode(BrushDump(it, device.bondState == BluetoothDevice.BOND_BONDED))) },
        { continuation.resumeWithException(BrushDumpFailed(it)) }
      )
      val gatt = device.connectGatt(context, false, reader, BluetoothDevice.TRANSPORT_LE)
      continuation.invokeOnCancellation { gatt.close() }
    }
  }

  private class Reader(
    private val name: String,
    private val brand: String,
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
        end(gatt) { failed("the connection ended with status $status; wake the brush, close the brand's own app and try again") }
      }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) {
        end(gatt) { failed("the services could not be listed (status $status)") }
        return
      }
      gatt.services.forEach { service ->
        service.characteristics
          .filter { it.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0 }
          .filter { wanted(service.uuid.toString().lowercase(), GattUuid.short(it.uuid)) }
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

    private fun wanted(service: String, characteristic: String): Boolean =
      GattUuid.short(java.util.UUID.fromString(service)) == DEVICE_INFORMATION || BrushKinds.dumpWanted(brand, characteristic)

    private fun remember(characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) values[key(characteristic)] = value.toHex()
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
    const val DEVICE_INFORMATION = "180a"
  }
}
