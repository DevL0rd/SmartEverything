package expo.modules.healthconnect.larq

import java.time.Instant

interface LarqTransport {
  val rssi: Int?

  suspend fun open(): Boolean

  suspend fun readBattery(): Int?

  suspend fun readInformation(): BottleInformation

  suspend fun exchange(frame: ByteArray): ByteArray?

  fun pushedBatteries(): List<Int>

  fun close()
}

object LarqLimits {
  const val RETRIES = 2
  const val MAX_PAGES = 400
  const val REQUEST_MS = 4_000L
  const val CONNECT_MS = 15_000L
  const val SCAN_MS = 10_000L
  const val MTU = 247
  const val UPRIGHT_ADVICE = "Put the bottle upright on a flat surface and try again."
  const val ASLEEP_DETAIL = "The bottle is asleep. Tap the cap and try again."
}

class LarqRunner(private val transport: LarqTransport, private val clock: () -> Instant) {
  private val responses = mutableListOf<CapResponse>()
  private val batteryReads = mutableListOf<BatteryRead>()
  private var dis: BottleInformation? = null
  private var outcome = OK
  private val reasons = mutableListOf<String>()
  private var nextId = LarqFrames.FIRST_PHONE_ID

  suspend fun run(plan: BottlePlan, trigger: String): SyncUpload {
    val started = clock()
    try {
      if (!transport.open()) {
        return finish(trigger, started, "disconnected", "The bottle did not accept a connection.")
      }
      for (step in plan.steps) {
        if (!perform(step)) break
      }
    } finally {
      transport.close()
    }
    return finish(trigger, started, outcome, reasons.takeIf { it.isNotEmpty() }?.joinToString(" "))
  }

  private suspend fun perform(step: BottleStep): Boolean = when (step.kind) {
    "gatt_read" -> read(step.what)
    "set_time" -> ask(step.name, LarqFrames.setTime(++nextId, clock().toEpochMilli()))?.let { true } ?: false
    "request" -> request(step)
    "log" -> pages(step)
    else -> fail("disconnected", "The plan has a step this phone does not know: ${step.kind}.")
  }

  private suspend fun read(what: String?): Boolean {
    if (what == "battery") {
      val pct = transport.readBattery() ?: return fail("disconnected", "The battery level could not be read.")
      batteryReads.add(BatteryRead(clock().toString(), pct, false))
    } else {
      dis = transport.readInformation()
    }
    return true
  }

  private suspend fun request(step: BottleStep): Boolean {
    val hex = step.requestHex ?: return fail("disconnected", "The step ${step.name} has no request.")
    val answer = ask(step.name, LarqHex.bytes(hex)) ?: return false
    val gate = step.gate ?: return true
    if (LarqFrames.gateAllows(answer, gate.toleranceG)) return true
    return fail("refused", LarqLimits.UPRIGHT_ADVICE)
  }

  private suspend fun pages(step: BottleStep): Boolean {
    val log = step.log ?: return fail("disconnected", "The step ${step.name} names no log.")
    val limit = step.limit ?: LarqFrames.MAX_LIMIT
    var from = step.fromTimestamp ?: 0L
    repeat(LarqLimits.MAX_PAGES) {
      val answer = ask(step.name, LarqFrames.log(++nextId, log, from, limit)) ?: return false
      val read = LarqFrames.scanPage(answer)
      if (read is PageRead.Unreadable) return unreadable(step.name, read.reason)
      if (read !is PageRead.Page) return true
      from = LarqFrames.nextCursor(from, limit, read.page) ?: return true
    }
    return true
  }

  private suspend fun ask(name: String, frame: ByteArray): ByteArray? {
    repeat(LarqLimits.RETRIES + 1) {
      val answer = transport.exchange(frame)
      responses.add(CapResponse(name, clock().toString(), answer?.let(LarqHex::of), answer == null))
      if (answer != null) return answer
    }
    fail("disconnected", "The bottle did not answer $name in ${LarqLimits.RETRIES + 1} tries.")
    return null
  }

  private fun unreadable(name: String, reason: String): Boolean {
    reasons.add("The reply to $name was unreadable: $reason.")
    if (outcome == OK) outcome = UNREADABLE
    return true
  }

  private fun fail(code: String, text: String): Boolean {
    outcome = code
    reasons.add(text)
    return false
  }

  private fun finish(trigger: String, started: Instant, code: String, text: String?): SyncUpload {
    val pushed = transport.pushedBatteries().map { BatteryRead(clock().toString(), it, true) }
    return SyncUpload(
      trigger = trigger,
      startedAt = started.toString(),
      endedAt = clock().toString(),
      outcome = code,
      detail = text,
      rssi = transport.rssi,
      dis = dis,
      batteryReads = batteryReads + pushed,
      responses = responses
    )
  }

  companion object {
    private const val OK = "ok"
    private const val UNREADABLE = "unreadable"

    fun asleep(trigger: String, now: Instant): SyncUpload = SyncUpload(
      trigger = trigger,
      startedAt = now.toString(),
      endedAt = now.toString(),
      outcome = "asleep",
      detail = LarqLimits.ASLEEP_DETAIL,
      rssi = null,
      dis = null,
      batteryReads = emptyList(),
      responses = emptyList()
    )
  }
}
