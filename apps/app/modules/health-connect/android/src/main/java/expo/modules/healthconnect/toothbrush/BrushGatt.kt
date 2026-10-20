package expo.modules.healthconnect.toothbrush

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Build
import android.os.Handler
import expo.modules.healthconnect.treadmill.GattUuid
import java.lang.reflect.InvocationTargetException

class HandlerLoop(private val handler: Handler) : BrushLoop {
  override fun post(block: () -> Unit) {
    handler.post(block)
  }

  override fun clear() {
    handler.removeCallbacksAndMessages(null)
  }
}

@SuppressLint("MissingPermission")
class BrushGatt(
  private val context: Context,
  private val loop: BrushLoop,
  private val events: BrushRadioEvents
) : BrushRadio {
  private var gatt: BluetoothGatt? = null

  override fun available(): Boolean =
    context.getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled == true

  override fun bonded(address: String): Boolean =
    context.getSystemService(BluetoothManager::class.java)?.adapter
      ?.getRemoteDevice(address)?.bondState == BluetoothDevice.BOND_BONDED

  override fun connect(address: String, autoConnect: Boolean) {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return
    gatt = adapter.getRemoteDevice(address).connectGatt(context, autoConnect, callback, BluetoothDevice.TRANSPORT_LE)
  }

  override fun reconnect() {
    gatt?.connect()
  }

  override fun discover() {
    gatt?.discoverServices()
  }

  override fun refresh(): Boolean {
    val target = gatt ?: return false
    return try {
      target.javaClass.getMethod("refresh").invoke(target) as? Boolean ?: false
    } catch (_: NoSuchMethodException) {
      false
    } catch (_: IllegalAccessException) {
      false
    } catch (_: InvocationTargetException) {
      false
    }
  }

  override fun readRssi() {
    gatt?.readRemoteRssi()
  }

  override fun has(service: String, characteristic: String): Boolean = characteristicOf(service, characteristic) != null

  override fun subscribe(subscription: Subscription): Boolean {
    val target = gatt ?: return false
    val characteristic = characteristicOf(subscription.service, subscription.characteristic) ?: return false
    val descriptor = characteristic.getDescriptor(GattUuid.CCCD) ?: return false
    if (!target.setCharacteristicNotification(characteristic, true)) return false
    val indicate = characteristic.properties and BluetoothGattCharacteristic.PROPERTY_NOTIFY == 0 &&
      characteristic.properties and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0
    val value = if (indicate) BluetoothGattDescriptor.ENABLE_INDICATION_VALUE else BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      target.writeDescriptor(descriptor, value) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      descriptor.setValue(value)
      @Suppress("DEPRECATION")
      target.writeDescriptor(descriptor)
    }
  }

  override fun read(service: String, characteristic: String): Boolean {
    val target = gatt ?: return false
    val found = characteristicOf(service, characteristic) ?: return false
    if (found.properties and BluetoothGattCharacteristic.PROPERTY_READ == 0) return false
    return target.readCharacteristic(found)
  }

  override fun write(service: String, characteristic: String, bytes: ByteArray, withoutResponse: Boolean): Boolean {
    val target = gatt ?: return false
    val found = characteristicOf(service, characteristic) ?: return false
    val type = if (withoutResponse) BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      target.writeCharacteristic(found, bytes, type) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      found.setValue(bytes)
      found.writeType = type
      @Suppress("DEPRECATION")
      target.writeCharacteristic(found)
    }
  }

  override fun close() {
    gatt?.close()
    gatt = null
  }

  private fun characteristicOf(service: String, characteristic: String): BluetoothGattCharacteristic? =
    gatt?.getService(GattUuid.of(service))?.getCharacteristic(GattUuid.of(characteristic))

  private fun current(source: BluetoothGatt): Boolean = source === gatt

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(source: BluetoothGatt, status: Int, newState: Int) {
      val up = newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS
      val down = newState == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS
      if (up || down) loop.post { if (current(source)) events.connectionChanged(status, up) }
    }

    override fun onServicesDiscovered(source: BluetoothGatt, status: Int) {
      loop.post { if (current(source)) events.discovered(status) }
    }

    override fun onCharacteristicWrite(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      loop.post { events.operationDone(status) }
    }

    override fun onDescriptorWrite(source: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      loop.post { events.operationDone(status) }
    }

    override fun onCharacteristicRead(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
      loop.post { events.valueRead(characteristic.uuid, value, status) }
    }

    @Deprecated("Replaced by the version that carries the value on Android 13")
    override fun onCharacteristicRead(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      @Suppress("DEPRECATION")
      val value = characteristic.value?.copyOf() ?: ByteArray(0)
      loop.post { events.valueRead(characteristic.uuid, value, status) }
    }

    override fun onCharacteristicChanged(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      loop.post { events.valueChanged(characteristic.uuid, value) }
    }

    @Deprecated("Replaced by the version that carries the value on Android 13")
    override fun onCharacteristicChanged(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      @Suppress("DEPRECATION")
      val value = characteristic.value?.copyOf() ?: return
      loop.post { events.valueChanged(characteristic.uuid, value) }
    }

    override fun onReadRemoteRssi(source: BluetoothGatt, rssi: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) loop.post { events.rssiRead(rssi) }
    }
  }
}
