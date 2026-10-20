package expo.modules.healthconnect.larq

import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.hex
import expo.modules.healthconnect.watch.ProtoWriter
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LarqRunnerTest {
  private val now = Instant.parse("2026-10-18T12:00:00Z")

  private class FakeCap(
    private val opens: Boolean = true,
    private val answers: (Int, ByteArray) -> ByteArray?
  ) : LarqTransport {
    val sent = mutableListOf<ByteArray>()
    var closed = false
    var pushed = emptyList<Int>()
    override var rssi: Int? = -58

    override suspend fun open(): Boolean = opens

    override suspend fun readBattery(): Int? = 81

    override suspend fun readInformation() = BottleInformation("LARQ", "PureVis 2", "0123456789ABCDEF", "1.13", "B", "S")

    override suspend fun exchange(frame: ByteArray): ByteArray? {
      sent.add(frame)
      return answers(sent.size, frame)
    }

    override fun pushedBatteries(): List<Int> = pushed

    override fun close() {
      closed = true
    }
  }

  private fun runner(cap: LarqTransport) = LarqRunner(cap) { now }

  private fun plan(vararg steps: BottleStep) = BottlePlan("0123456789ABCDEF", steps.toList())

  private fun read(what: String) = BottleStep("gatt_read", what, what = what)

  private fun log(from: Long, limit: Int) = BottleStep("log", "tof_log", log = "tof", fromTimestamp = from, limit = limit)

  private fun page(vararg stamps: Long): ByteArray {
    val rows = stamps.fold(ProtoWriter()) { writer, stamp -> writer.message(1, ProtoWriter().varint(1, stamp).varint(2, 1)) }
    val any = ProtoWriter().string(1, "type.googleapis.com/ResponseGetCapTofLog").bytes(2, rows.toByteArray())
    return hex("0d 01 00 00 00 10 01") + ProtoWriter().message(3, any).toByteArray()
  }

  private fun accelerometer(x: Float, y: Float, z: Float): ByteArray {
    val reading = ProtoWriter().float(1, x).float(2, y).float(3, z)
    val any = ProtoWriter().string(1, "type.googleapis.com/ResponseGetCapAccelerometerState")
      .bytes(2, ProtoWriter().message(1, reading).toByteArray())
    return hex("0d 05 00 00 00 10 01") + ProtoWriter().message(3, any).toByteArray()
  }

  @Test
  fun `a full plan reads, sets the clock, asks with the gate and pages the log until a short page`() = runBlocking {
    val upright = accelerometer(0.0f, 0.0f, 1.0f)
    val cap = FakeCap { count, _ ->
      when (count) {
        1 -> LarqHex.bytes("0d0100000010011a00")
        2 -> upright
        3 -> page(10, 20)
        else -> page(30)
      }
    }
    val request = BottleStep("request", "orientation", requestHex = "0d05000000", gate = BottleGate("upright_still", 0.15))
    val upload = runner(cap).run(plan(read("battery"), read("device_information"), BottleStep("set_time", "clock"), request, log(5, 2)), "wake")

    assertEquals("ok", upload.outcome)
    assertNull(upload.detail)
    assertEquals(-58, upload.rssi)
    assertEquals(81, upload.batteryReads.single().pct)
    assertFalse(upload.batteryReads.single().pushed)
    assertEquals("PureVis 2", upload.dis?.model)
    assertEquals(listOf("clock", "orientation", "tof_log", "tof_log"), upload.responses.map { it.name })
    assertTrue(upload.responses.none { it.timedOut || it.hex == null })
    assertEquals(LarqHex.of(LarqFrames.setTime(1001, now.toEpochMilli())), LarqHex.of(cap.sent[0]))
    assertEquals(LarqHex.of(LarqFrames.log(1002, "tof", 5, 2)), LarqHex.of(cap.sent[2]))
    assertEquals(LarqHex.of(LarqFrames.log(1003, "tof", 20, 2)), LarqHex.of(cap.sent[3]))
    assertTrue(cap.closed)
  }

  @Test
  fun `a bottle that is not upright and still refuses the rest of the plan`() = runBlocking {
    val cap = FakeCap { _, _ -> accelerometer(0.7f, 0.0f, 0.7f) }
    val request = BottleStep("request", "orientation", requestHex = "0d05000000", gate = BottleGate("upright_still", 0.15))
    val upload = runner(cap).run(plan(request, log(0, 5)), "action")
    assertEquals("refused", upload.outcome)
    assertEquals(LarqLimits.UPRIGHT_ADVICE, upload.detail)
    assertEquals(1, upload.responses.size)
    assertEquals(1, cap.sent.size)
    assertEquals("action", upload.trigger)
  }

  @Test
  fun `a request without a gate goes through whatever the answer`() = runBlocking {
    val cap = FakeCap { _, _ -> hex("0d 09 00 00 00 10 02") }
    val upload = runner(cap).run(plan(BottleStep("request", "ui", requestHex = "0d01000000")), "wake")
    assertEquals("ok", upload.outcome)
    assertEquals(1, upload.responses.size)
  }

  @Test
  fun `a timeout is tried three times and then ends the sync as disconnected`() = runBlocking {
    val cap = FakeCap { _, _ -> null }
    val upload = runner(cap).run(plan(BottleStep("set_time", "clock"), log(0, 5)), "wake")
    assertEquals(3, cap.sent.size)
    assertEquals("disconnected", upload.outcome)
    assertEquals("The bottle did not answer clock.", upload.detail)
    val response = upload.responses.single()
    assertTrue(response.timedOut)
    assertNull(response.hex)
  }

  @Test
  fun `an answer that arrives on the second try is kept`() = runBlocking {
    val cap = FakeCap { count, _ -> if (count == 1) null else page(10) }
    val upload = runner(cap).run(plan(log(0, 5)), "wake")
    assertEquals("ok", upload.outcome)
    assertEquals(2, cap.sent.size)
    assertFalse(upload.responses.single().timedOut)
  }

  @Test
  fun `a refused page ends that log and the plan goes on`() = runBlocking {
    val cap = FakeCap { count, _ -> if (count == 1) hex("0d 09 00 00 00 10 02") else page(10) }
    val upload = runner(cap).run(plan(log(0, 5), BottleStep("log", "other", log = "fault", fromTimestamp = 0, limit = 5)), "wake")
    assertEquals("ok", upload.outcome)
    assertEquals(listOf("tof_log", "other"), upload.responses.map { it.name })
  }

  @Test
  fun `paging stops after the page limit`() = runBlocking {
    var stamp = 0L
    val cap = FakeCap { _, _ -> page(++stamp, ++stamp) }
    val upload = runner(cap).run(plan(log(0, 2)), "wake")
    assertEquals(LarqLimits.MAX_PAGES, upload.responses.size)
  }

  @Test
  fun `a bottle that does not accept a connection is a disconnected sync`() = runBlocking {
    val cap = FakeCap(opens = false) { _, _ -> null }
    val upload = runner(cap).run(plan(BottleStep("set_time", "clock")), "wake")
    assertEquals("disconnected", upload.outcome)
    assertTrue(upload.responses.isEmpty())
    assertTrue(cap.closed)
  }

  @Test
  fun `a battery level the bottle pushed is uploaded as pushed`() = runBlocking {
    val cap = FakeCap { _, _ -> page(10) }
    cap.pushed = listOf(79)
    val upload = runner(cap).run(plan(log(0, 5)), "wake")
    val push = upload.batteryReads.single()
    assertEquals(79, push.pct)
    assertTrue(push.pushed)
  }

  @Test
  fun `a battery that cannot be read ends the sync`() = runBlocking {
    val cap = object : LarqTransport by FakeCap(answers = { _, _ -> null }) {
      override suspend fun readBattery(): Int? = null
    }
    val upload = runner(cap).run(plan(read("battery"), BottleStep("set_time", "clock")), "wake")
    assertEquals("disconnected", upload.outcome)
    assertEquals("The battery level could not be read.", upload.detail)
    assertTrue(upload.responses.isEmpty())
  }

  @Test
  fun `a step this phone does not know ends the sync`() = runBlocking {
    val upload = runner(FakeCap { _, _ -> null }).run(plan(BottleStep("future", "later")), "wake")
    assertEquals("disconnected", upload.outcome)
  }

  @Test
  fun `a request or log step with missing parts ends the sync`() = runBlocking {
    val noRequest = runner(FakeCap { _, _ -> null }).run(plan(BottleStep("request", "ui")), "wake")
    assertEquals("The step ui has no request.", noRequest.detail)
    val noLog = runner(FakeCap { _, _ -> null }).run(plan(BottleStep("log", "tof_log")), "wake")
    assertEquals("The step tof_log names no log.", noLog.detail)
  }

  @Test
  fun `the asleep upload says so and carries nothing else`() {
    val upload = LarqRunner.asleep("action", now)
    assertEquals("asleep", upload.outcome)
    assertEquals(LarqLimits.ASLEEP_DETAIL, upload.detail)
    assertTrue(upload.responses.isEmpty())
    assertNull(upload.rssi)
  }

  @Test
  fun `an upload always names the fields the hub requires, even when empty`() {
    val text = HubJson.encode(LarqRunner.asleep("wake", now))
    assertTrue(text.contains("\"detail\":"))
    assertTrue(text.contains("\"rssi\":null"))
    assertTrue(text.contains("\"dis\":null"))
    assertTrue(text.contains("\"batteryReads\":[]"))
    assertTrue(text.contains("\"responses\":[]"))
  }

  @Test
  fun `the plan the hub sends decodes with its nulls and extra names`() {
    val text = """{"bottles":[{"deviceId":"d","serial":"0123456789ABCDEF","name":"Kitchen","extra":1,"plan":{"serial":"0123456789ABCDEF","steps":[
      {"kind":"gatt_read","name":"battery","what":"battery"},
      {"kind":"set_time","name":"clock"},
      {"kind":"request","name":"orientation","requestHex":"0d05000000","gate":{"kind":"upright_still","toleranceG":0.15}},
      {"kind":"request","name":"ui","requestHex":"0d01000000","gate":null},
      {"kind":"log","name":"tof_log","log":"tof","fromTimestamp":5,"limit":10}]}}]}"""
    val bottle = HubJson.decode<PhoneBottles>(text).bottles.single()
    assertEquals("Kitchen", bottle.name)
    assertEquals(5, bottle.plan.steps.size)
    assertEquals(0.15, bottle.plan.steps[2].gate?.toleranceG ?: 0.0, 0.0)
    assertNull(bottle.plan.steps[3].gate)
    assertEquals(5L, bottle.plan.steps[4].fromTimestamp)
    assertNotNull(HubJson.decode<BottlePlan>(HubJson.encode(bottle.plan)))
  }
}
