package expo.modules.healthconnect.larq

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
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull

object LarqUuid {
  private const val BASE = "-0000-1000-8000-00805f9b34fb"
  val NUS_SERVICE: UUID = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e")
  val NUS_WRITE: UUID = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e")
  val NUS_NOTIFY: UUID = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e")
  val CCCD: UUID = of("2902")
  val BATTERY_SERVICE: UUID = of("180f")
  val BATTERY_LEVEL: UUID = of("2a19")
  val INFORMATION_SERVICE: UUID = of("180a")
  val MANUFACTURER: UUID = of("2a29")
  val MODEL: UUID = of("2a24")
  val SERIAL: UUID = of("2a25")
  val FIRMWARE: UUID = of("2a26")
  val HARDWARE: UUID = of("2a27")
  val SOFTWARE: UUID = of("2a28")

  private fun of(short: String): UUID = UUID.fromString("0000$short$BASE")
}

@SuppressLint("MissingPermission")
class LarqGatt(private val context: Context, private val address: String) : LarqTransport {
  private var gatt: BluetoothGatt? = null
  private var connected = CompletableDeferred<Boolean>()
  private var step = CompletableDeferred<Int>()
  private var read = CompletableDeferred<ByteArray?>()
  private val frames = Channel<ByteArray>(Channel.UNLIMITED)
  private val batteries = CopyOnWriteArrayList<Int>()

  @Volatile
  override var rssi: Int? = null
    private set

  override suspend fun open(): Boolean {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    if (adapter == null || !adapter.isEnabled) return false
    gatt = adapter.getRemoteDevice(address).connectGatt(context, false, callback, BluetoothDevice.TRANSPORT_LE)
    val ready = withTimeoutOrNull(LarqLimits.CONNECT_MS) { connected.await() } ?: false
    if (!ready) close()
    return ready
  }

  override suspend fun readBattery(): Int? = readValue(LarqUuid.BATTERY_SERVICE, LarqUuid.BATTERY_LEVEL)?.firstOrNull()?.toInt()?.and(0xff)

  override suspend fun readInformation(): BottleInformation {
    suspend fun text(uuid: UUID): String? = readValue(LarqUuid.INFORMATION_SERVICE, uuid)?.toString(Charsets.UTF_8)?.trim('\u0000')
    return BottleInformation(
      text(LarqUuid.MANUFACTURER),
      text(LarqUuid.MODEL),
      text(LarqUuid.SERIAL),
      text(LarqUuid.FIRMWARE),
      text(LarqUuid.HARDWARE),
      text(LarqUuid.SOFTWARE)
    )
  }

  override suspend fun exchange(frame: ByteArray): ByteArray? {
    val characteristic = gatt?.getService(LarqUuid.NUS_SERVICE)?.getCharacteristic(LarqUuid.NUS_WRITE) ?: return null
    val id = LarqFrames.requestIdOf(frame)
    while (frames.tryReceive().isSuccess) Unit
    step = CompletableDeferred()
    if (!write(characteristic, frame)) return null
    val written = withTimeoutOrNull(LarqLimits.REQUEST_MS) { step.await() }
    if (written != BluetoothGatt.GATT_SUCCESS) return null
    return withTimeoutOrNull(LarqLimits.REQUEST_MS) { answerFor(id) }
  }

  override fun pushedBatteries(): List<Int> = batteries.toList()

  override fun close() {
    gatt?.close()
    gatt = null
  }

  private suspend fun answerFor(id: Long?): ByteArray {
    while (true) {
      val frame = frames.receive()
      if (id == null || LarqFrames.requestIdOf(frame) == id) return frame
    }
  }

  private suspend fun readValue(service: UUID, uuid: UUID): ByteArray? {
    val characteristic = gatt?.getService(service)?.getCharacteristic(uuid) ?: return null
    read = CompletableDeferred()
    if (gatt?.readCharacteristic(characteristic) != true) return null
    return withTimeoutOrNull(LarqLimits.REQUEST_MS) { read.await() }
  }

  private fun write(characteristic: BluetoothGattCharacteristic, bytes: ByteArray): Boolean {
    val target = gatt ?: return false
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      target.writeCharacteristic(characteristic, bytes, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      characteristic.setValue(bytes)
      characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      @Suppress("DEPRECATION")
      target.writeCharacteristic(characteristic)
    }
  }

  private fun subscribe(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic): Boolean {
    val descriptor = characteristic.getDescriptor(LarqUuid.CCCD) ?: return false
    if (!source.setCharacteristicNotification(characteristic, true)) return false
    val value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      source.writeDescriptor(descriptor, value) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      descriptor.setValue(value)
      @Suppress("DEPRECATION")
      source.writeDescriptor(descriptor)
    }
  }

  private fun discovered(source: BluetoothGatt) {
    val notify = source.getService(LarqUuid.NUS_SERVICE)?.getCharacteristic(LarqUuid.NUS_NOTIFY)
    if (notify == null || !subscribe(source, notify)) connected.complete(false)
  }

  private fun subscribed(source: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
    if (descriptor.characteristic.uuid == LarqUuid.NUS_NOTIFY) {
      val battery = source.getService(LarqUuid.BATTERY_SERVICE)?.getCharacteristic(LarqUuid.BATTERY_LEVEL)
      if (status == BluetoothGatt.GATT_SUCCESS && battery != null && subscribe(source, battery)) return
      connected.complete(status == BluetoothGatt.GATT_SUCCESS)
    } else {
      connected.complete(true)
    }
  }

  private fun changed(uuid: UUID, value: ByteArray) {
    if (uuid == LarqUuid.NUS_NOTIFY) frames.trySend(value) else if (uuid == LarqUuid.BATTERY_LEVEL) value.firstOrNull()?.let { batteries.add(it.toInt() and 0xff) }
  }

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(source: BluetoothGatt, status: Int, newState: Int) {
      if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
        if (!source.requestMtu(LarqLimits.MTU)) source.discoverServices()
        source.readRemoteRssi()
      } else {
        connected.complete(false)
        step.complete(BluetoothGatt.GATT_FAILURE)
        read.complete(null)
      }
    }

    override fun onMtuChanged(source: BluetoothGatt, mtu: Int, status: Int) {
      source.discoverServices()
    }

    override fun onServicesDiscovered(source: BluetoothGatt, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) discovered(source) else connected.complete(false)
    }

    override fun onDescriptorWrite(source: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      subscribed(source, descriptor, status)
    }

    override fun onCharacteristicWrite(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      step.complete(status)
    }

    override fun onCharacteristicRead(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray, status: Int) {
      read.complete(if (status == BluetoothGatt.GATT_SUCCESS) value else null)
    }

    @Deprecated("Replaced by the version that carries the value on Android 13")
    override fun onCharacteristicRead(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      @Suppress("DEPRECATION")
      read.complete(if (status == BluetoothGatt.GATT_SUCCESS) characteristic.value?.copyOf() else null)
    }

    override fun onCharacteristicChanged(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      changed(characteristic.uuid, value)
    }

    @Deprecated("Replaced by the version that carries the value on Android 13")
    override fun onCharacteristicChanged(source: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      @Suppress("DEPRECATION")
      characteristic.value?.copyOf()?.let { changed(characteristic.uuid, it) }
    }

    override fun onReadRemoteRssi(source: BluetoothGatt, value: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) rssi = value
    }
  }
}
