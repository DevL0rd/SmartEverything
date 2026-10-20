package expo.modules.healthconnect.treadmill

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
import android.os.SystemClock
import expo.modules.healthconnect.diagnostics.NativeLog
import java.util.UUID

object GattUuid {
  private const val BASE_SUFFIX = "-0000-1000-8000-00805f9b34fb"
  val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

  fun of(text: String): UUID = UUID.fromString(if (text.length == 4) "0000$text$BASE_SUFFIX" else text)

  fun short(uuid: UUID): String {
    val text = uuid.toString().lowercase()
    return if (text.startsWith("0000") && text.endsWith(BASE_SUFFIX)) text.substring(4, 8) else text
  }
}

interface LinkListener {
  fun phase(phase: String, detail: String?)

  fun notified(characteristic: String, value: ByteArray)

  fun commanded()
}

@SuppressLint("MissingPermission")
class GattLink(
  private val context: Context,
  private val handler: Handler,
  private val plan: LinkPlan,
  private val listener: LinkListener
) {
  private sealed interface Op {
    class Subscribe(val delivery: LinkDelivery) : Op

    class Write(val step: WriteStep) : Op

    class Done(val callback: (Boolean, String) -> Unit) : Op
  }

  private val queue = ArrayDeque<Op>()
  private var current: Op? = null
  private var gatt: BluetoothGatt? = null
  private var failures = 0
  private var connectedAt = 0L
  private var closed = false
  var reconnects = 0
    private set
  var rssi: Int? = null
    private set
  @Volatile
  var ready = false
    private set

  fun start() {
    closed = false
    connect()
  }

  fun close() {
    closed = true
    handler.removeCallbacksAndMessages(null)
    release("The link was closed on this phone.")
  }

  fun run(steps: List<WriteStep>, done: (Boolean, String) -> Unit) {
    enqueue(steps) { ok, detail ->
      if (ok) listener.commanded()
      done(ok, detail)
    }
  }

  private fun enqueue(steps: List<WriteStep>, done: (Boolean, String) -> Unit) {
    handler.post {
      if (!ready) {
        done(false, "The treadmill is not linked to this phone right now.")
        return@post
      }
      steps.flatMap { expanded(it) }.forEach { queue.addLast(Op.Write(it)) }
      queue.addLast(Op.Done(done))
      pump()
    }
  }

  private fun expanded(step: WriteStep): List<WriteStep> {
    val preamble = plan.preamble
    val control = plan.control
    if (preamble == null || control == null || step.characteristic != control.characteristic) return listOf(step)
    return listOf(WriteStep(preamble.characteristic, control.service, preamble.hex, "with_response", 0), step)
  }

  fun send(step: WriteStep) {
    enqueue(listOf(step)) { _, _ -> }
  }

  private fun connect() {
    val adapter = context.getSystemService(BluetoothManager::class.java)?.adapter
    if (adapter == null || !adapter.isEnabled) {
      listener.phase("not_linked", "Bluetooth is off or missing on this phone.")
      return
    }
    listener.phase("connecting", null)
    connectedAt = SystemClock.elapsedRealtime()
    gatt = adapter.getRemoteDevice(plan.address).connectGatt(context, plan.autoConnect, callback, BluetoothDevice.TRANSPORT_LE)
  }

  private fun release(reason: String) {
    ready = false
    failAll(reason)
    queue.clear()
    current = null
    gatt?.close()
    gatt = null
  }

  private fun dropped(status: Int) {
    release("The link to the treadmill dropped (status $status).")
    if (closed) return
    val quick = SystemClock.elapsedRealtime() - connectedAt < QUICK_DROP_MS
    failures = if (quick) failures + 1 else 1
    reconnects += 1
    if (failures >= BUSY_AFTER) {
      listener.phase("busy", "Another app, probably KS Fit, may hold the treadmill. Close it on every phone.")
    } else {
      listener.phase("lost", "The link dropped (status $status); trying again.")
    }
    handler.postDelayed({ if (!closed) connect() }, RETRY_MS[minOf(failures, RETRY_MS.size) - 1])
  }

  private fun stateChanged(source: BluetoothGatt, status: Int, state: Int) {
    if (source !== gatt) return
    if (state == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
      source.discoverServices()
      source.readRemoteRssi()
    } else if (state == BluetoothProfile.STATE_DISCONNECTED || status != BluetoothGatt.GATT_SUCCESS) {
      dropped(status)
    }
  }

  private fun discovered(source: BluetoothGatt, status: Int) {
    if (source !== gatt) return
    if (status != BluetoothGatt.GATT_SUCCESS) {
      dropped(status)
      return
    }
    val missing = plan.subscriptions.firstOrNull { characteristicOf(it.service, it.characteristic) == null }
    if (missing != null) {
      release("The treadmill does not offer ${missing.characteristic} in ${missing.service}.")
      listener.phase("lost", "This treadmill does not offer what its saved setup expects; set it up again.")
      return
    }
    queue.clear()
    plan.subscriptions.forEach { queue.addLast(Op.Subscribe(it)) }
    plan.initial.forEach { queue.addLast(Op.Write(it)) }
    queue.addLast(Op.Done { _, _ ->
      failures = 0
      ready = true
      listener.phase("linked", null)
    })
    pump()
  }

  private fun characteristicOf(service: String, characteristic: String): BluetoothGattCharacteristic? =
    gatt?.getService(GattUuid.of(service))?.getCharacteristic(GattUuid.of(characteristic))

  private fun pump() {
    if (current != null) return
    val op = queue.removeFirstOrNull() ?: return
    current = op
    when (op) {
      is Op.Subscribe -> if (!subscribe(op.delivery)) {
        rejected("subscribe", op.delivery.characteristic)
        finished(BluetoothGatt.GATT_FAILURE)
      }
      is Op.Write -> if (!write(op.step)) {
        rejected("write", op.step.characteristic)
        finished(BluetoothGatt.GATT_FAILURE)
      }
      is Op.Done -> {
        current = null
        op.callback(true, "Done.")
        pump()
      }
    }
  }

  private fun subscribe(delivery: LinkDelivery): Boolean {
    val target = gatt ?: return false
    val characteristic = characteristicOf(delivery.service, delivery.characteristic) ?: return false
    val descriptor = characteristic.getDescriptor(GattUuid.CCCD) ?: return false
    if (!target.setCharacteristicNotification(characteristic, true)) return false
    val value = if (delivery.mode == "indicate") BluetoothGattDescriptor.ENABLE_INDICATION_VALUE else BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      target.writeDescriptor(descriptor, value) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      descriptor.setValue(value)
      @Suppress("DEPRECATION")
      target.writeDescriptor(descriptor)
    }
  }

  private fun write(step: WriteStep): Boolean {
    val target = gatt ?: return false
    val characteristic = characteristicOf(step.service, step.characteristic) ?: return false
    val type = if (step.writeType == "without_response") BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE else BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
    val bytes = TreadmillHex.bytes(step.hex)
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      target.writeCharacteristic(characteristic, bytes, type) == BluetoothStatusCodes.SUCCESS
    } else {
      @Suppress("DEPRECATION")
      characteristic.setValue(bytes)
      characteristic.writeType = type
      @Suppress("DEPRECATION")
      target.writeCharacteristic(characteristic)
    }
  }

  private fun finished(status: Int) {
    val op = current ?: return
    current = null
    if (status != BluetoothGatt.GATT_SUCCESS) {
      val reason = "The treadmill refused a Bluetooth write (status $status)."
      if (ready) {
        failAll(reason)
        queue.clear()
      } else {
        dropped(status)
      }
      return
    }
    val pause = when (op) {
      is Op.Subscribe -> plan.cccdPacingMs
      is Op.Write -> maxOf(plan.writePacingMs, op.step.pauseAfterMs)
      is Op.Done -> 0
    }
    handler.postDelayed({ pump() }, pause.toLong())
  }

  private fun logResult(operation: String, characteristic: String, status: Int) {
    val fields = mapOf("deviceId" to plan.deviceId, "operation" to operation, "characteristic" to characteristic, "ok" to (status == BluetoothGatt.GATT_SUCCESS), "status" to status)
    if (status == BluetoothGatt.GATT_SUCCESS) NativeLog.info(SCOPE, "gatt.$operation") { fields } else NativeLog.warn(SCOPE, "gatt.$operation") { fields }
  }

  private fun rejected(operation: String, characteristic: String) {
    NativeLog.warn(SCOPE, "gatt.$operation.rejected") { mapOf("deviceId" to plan.deviceId, "characteristic" to characteristic) }
  }

  private fun failAll(reason: String) {
    val pending = listOfNotNull(current) + queue
    pending.filterIsInstance<Op.Done>().forEach { it.callback(false, reason) }
  }

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      handler.post { stateChanged(gatt, status, newState) }
    }

    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      handler.post { discovered(gatt, status) }
    }

    override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
      val name = GattUuid.short(characteristic.uuid)
      handler.post {
        logResult("write", name, status)
        finished(status)
      }
    }

    override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
      val name = GattUuid.short(descriptor.characteristic.uuid)
      handler.post {
        logResult("subscribe", name, status)
        finished(status)
      }
    }

    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
      val name = GattUuid.short(characteristic.uuid)
      handler.post { listener.notified(name, value) }
    }

    @Deprecated("Replaced by the version that carries the value on Android 13")
    override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return
      val name = GattUuid.short(characteristic.uuid)
      @Suppress("DEPRECATION")
      val value = characteristic.value?.copyOf() ?: return
      handler.post { listener.notified(name, value) }
    }

    override fun onReadRemoteRssi(gatt: BluetoothGatt, rssi: Int, status: Int) {
      if (status == BluetoothGatt.GATT_SUCCESS) handler.post { this@GattLink.rssi = rssi }
    }
  }

  private companion object {
    const val SCOPE = "treadmill"
    const val QUICK_DROP_MS = 3_000L
    const val BUSY_AFTER = 3
    val RETRY_MS = longArrayOf(2_000L, 5_000L, 15_000L, 30_000L, 60_000L)
  }
}
