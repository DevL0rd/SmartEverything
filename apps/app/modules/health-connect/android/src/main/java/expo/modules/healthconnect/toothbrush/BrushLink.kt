package expo.modules.healthconnect.toothbrush

import android.os.SystemClock
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.fromHex
import expo.modules.healthconnect.sonicare.CondorListener
import expo.modules.healthconnect.sonicare.CondorPort
import expo.modules.healthconnect.sonicare.CondorTransport
import expo.modules.healthconnect.toHex
import expo.modules.healthconnect.treadmill.GattUuid
import java.util.UUID

interface BrushListener {
  fun phase(phase: String, detail: String?)

  fun notified(characteristic: String, value: ByteArray)

  fun ended()
}

class BrushLink(
  radioOf: (BrushRadioEvents) -> BrushRadio,
  private val loop: BrushLoop,
  private val plan: LinkPlan,
  private val listener: BrushListener,
  private val sync: Boolean = false,
  private val clock: () -> Long = { SystemClock.elapsedRealtime() }
) : CondorPort, CondorListener, BrushRadioEvents {
  private val radio = radioOf(this)
  private val ops = BrushQueue()
  private var closed = false
  private var refreshed = false
  private var connectedAt = 0L
  private var quickDrops = 0
  private val transport = CondorTransport(this, this)
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
    loop.clear()
    release("The link was closed on this phone.")
  }

  fun run(steps: List<Step>, done: (Boolean, String) -> Unit) {
    loop.post {
      if (!ready) {
        done(false, "The toothbrush is not linked to this phone right now.")
        return@post
      }
      steps.forEachIndexed { index, step -> enqueue(step, true, steps.getOrNull(index - 1)) }
      ops.addLast(BrushOp.Done(done))
      pump()
    }
  }

  private fun enqueue(step: Step, strict: Boolean, previous: Step? = null) {
    when (step) {
      is Step.Write -> ops.addLast(BrushOp.Write(step.service, step.characteristic, step.hex, step.writeType, strict))
      is Step.Read -> ops.addLast(BrushOp.Read(step.service, step.characteristic, strict, writtenBefore(step, previous)))
      is Step.CondorFrame -> ops.addLast(BrushOp.Frame(step.hex))
    }
  }

  private fun writtenBefore(read: Step.Read, previous: Step?): String? =
    if (previous is Step.Write && previous.service == read.service && previous.characteristic == read.characteristic) {
      previous.hex
    } else {
      null
    }

  override fun subscribe(characteristic: String) {
    ops.addLast(BrushOp.Subscribe(Subscription(CondorTransport.SERVICE, characteristic, "notify")))
    pump()
  }

  override fun write(characteristic: String, bytes: ByteArray, urgent: Boolean) {
    val op = BrushOp.Write(CondorTransport.SERVICE, characteristic, bytes.toHex(), "with_response", false)
    if (urgent) ops.addUrgent(op) else ops.addLast(op)
    pump()
  }

  override fun ready() {
    plan.initial.forEach { step ->
      if (step is Step.CondorFrame) transport.send(step.hex.fromHex())
    }
    finishSetup()
  }

  override fun failed(reason: String) {
    NativeLog.warn(SCOPE, "condor.failed") { mapOf("reason" to reason) }
    release(reason)
    listener.phase("busy", reason)
    listener.ended()
  }

  override fun received(characteristic: String, value: ByteArray) {
    listener.notified(characteristic, value)
  }

  private fun connect() {
    if (!radio.available()) {
      listener.phase("bluetooth_off", "Bluetooth is off or missing on this phone.")
      listener.ended()
      return
    }
    if (plan.bonded && !radio.bonded(plan.address)) {
      listener.phase("needs_pairing", "Run the toothbrush setup again; this brush needs to be paired with the phone.")
      listener.ended()
      return
    }
    listener.phase("connecting", null)
    connectedAt = clock()
    radio.connect(plan.address, plan.policy == ARMED && plan.bonded)
  }

  private fun release(reason: String) {
    ready = false
    ops.failAll(reason)
    ops.clear()
    transport.reset()
    radio.close()
  }

  private fun dropped(status: Int) {
    val quick = clock() - connectedAt < QUICK_DROP_MS
    quickDrops = if (quick) quickDrops + 1 else 0
    val armed = plan.policy == ARMED && plan.bonded && !closed && !sync
    if (armed) {
      ready = false
      ops.failAll("The link dropped (status $status).")
      ops.clear()
      transport.reset()
      listener.phase("asleep", null)
      radio.reconnect()
      return
    }
    release("The link to the toothbrush ended (status $status).")
    if (quickDrops >= BUSY_AFTER) {
      listener.phase("busy", BrushText.busy(plan.brand))
    } else {
      listener.phase("asleep", null)
    }
    listener.ended()
  }

  override fun connectionChanged(status: Int, connected: Boolean) {
    if (connected) {
      refreshed = false
      radio.discover()
      radio.readRssi()
    } else {
      dropped(status)
    }
  }

  override fun discovered(status: Int) {
    if (status != GATT_SUCCESS) {
      dropped(status)
      return
    }
    if (cacheStale() && !refreshed) {
      refreshed = true
      NativeLog.info(SCOPE, "gatt.refresh") { mapOf("brand" to plan.brand) }
      if (radio.refresh()) {
        radio.discover()
        return
      }
    }
    ops.clearQueued()
    if (sync) {
      plan.sync.forEach { ops.addLast(BrushOp.Read(it.service, it.characteristic, false)) }
      ops.addLast(BrushOp.Done { _, _ -> syncFinished() })
    } else {
      queueSetup()
    }
    pump()
  }

  private fun cacheStale(): Boolean {
    val wanted = plan.subscriptions.map { it.service to it.characteristic } +
      plan.reads.map { it.service to it.characteristic } +
      plan.sync.map { it.service to it.characteristic }
    return wanted.isNotEmpty() && wanted.none { (service, characteristic) -> radio.has(service, characteristic) }
  }

  private fun queueSetup() {
    plan.prepare.forEach { enqueue(it, false) }
    plan.subscriptions.forEach { ops.addLast(BrushOp.Subscribe(it)) }
    plan.reads.forEach { ops.addLast(BrushOp.Read(it.service, it.characteristic, false)) }
    if (plan.condor) {
      ops.addLast(BrushOp.CondorStart())
    } else {
      plan.initial.forEach { enqueue(it, false) }
      ops.addLast(BrushOp.Done { ok, _ -> if (ok) finishSetup() })
    }
  }

  private fun syncFinished() {
    release("The read finished.")
    listener.phase("asleep", null)
    listener.ended()
  }

  private fun finishSetup() {
    quickDrops = 0
    ready = true
    listener.phase("linked", null)
  }

  private fun pump() {
    val op = ops.take() ?: return
    when (op) {
      is BrushOp.Subscribe -> advance(op, radio.subscribe(op.subscription))
      is BrushOp.Read -> advance(op, radio.read(op.service, op.characteristic))
      is BrushOp.Write -> advance(op, radio.write(op.service, op.characteristic, op.hex.fromHex(), op.type == "without_response"))
      is BrushOp.Frame -> {
        ops.release()
        transport.send(op.hex.fromHex())
        pump()
      }
      is BrushOp.CondorStart -> {
        ops.release()
        transport.start()
        pump()
      }
      is BrushOp.Done -> {
        ops.release()
        op.callback(true, "Done.")
        pump()
      }
    }
  }

  private fun advance(op: BrushOp, started: Boolean) {
    if (started) return
    NativeLog.debug(SCOPE, "op.skipped") { mapOf("op" to op.javaClass.simpleName) }
    ops.release()
    ops.refuse(op, "The brush link could not start the operation.")
    pump()
  }

  override fun operationDone(status: Int) {
    finished(status)
  }

  private fun finished(status: Int, detail: String = "status $status") {
    val op = ops.release() ?: return
    if (status == GATT_INSUFFICIENT_AUTHENTICATION || status == GATT_INSUFFICIENT_ENCRYPTION) {
      release("The brush refused an encrypted operation (status $status).")
      listener.phase("needs_pairing", "Forget the brush in the phone's Bluetooth settings, then run the toothbrush setup again.")
      listener.ended()
      return
    }
    if (status != GATT_SUCCESS) {
      NativeLog.warn(SCOPE, "op.refused") { mapOf("op" to op.javaClass.simpleName, "status" to status) }
      ops.refuse(op, detail)
    }
    pump()
  }

  override fun valueRead(characteristic: UUID, value: ByteArray, status: Int) {
    if (status == GATT_SUCCESS) listener.notified(GattUuid.short(characteristic), value)
    val expected = (ops.current as? BrushOp.Read)?.expected
    if (status == GATT_SUCCESS && expected != null && !expected.equals(value.toHex(), ignoreCase = true)) {
      finished(READ_BACK_DIFFERS, "The brush did not keep the change; it reports ${value.toHex()} instead of $expected.")
      return
    }
    finished(status)
  }

  override fun valueChanged(characteristic: UUID, value: ByteArray) {
    when (characteristic.toString().lowercase()) {
      CondorTransport.SERVER_CONFIG -> transport.onServerConfig(value)
      CondorTransport.RX_ACK -> transport.onRxAck()
      CondorTransport.TX -> transport.onTx(value)
      else -> listener.notified(GattUuid.short(characteristic), value)
    }
  }

  override fun rssiRead(rssi: Int) {
    this.rssi = rssi
  }

  private companion object {
    const val SCOPE = "toothbrush"
    const val ARMED = "armed"
    const val QUICK_DROP_MS = 3_000L
    const val BUSY_AFTER = 3
    const val READ_BACK_DIFFERS = -1
    const val GATT_SUCCESS = 0
    const val GATT_INSUFFICIENT_AUTHENTICATION = 5
    const val GATT_INSUFFICIENT_ENCRYPTION = 15
  }
}
