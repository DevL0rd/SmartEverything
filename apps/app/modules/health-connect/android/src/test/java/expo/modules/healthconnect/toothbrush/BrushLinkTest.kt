package expo.modules.healthconnect.toothbrush

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BrushLinkTest {
  private val radio = FakeRadio()
  private val listener = RecordingListener()
  private var now = 10_000L

  private fun linkOf(plan: LinkPlan, sync: Boolean = false): BrushLink =
    BrushLink({ radio }, ImmediateLoop(), plan, listener, sync) { now }

  private fun carry(link: BrushLink, steps: Int) {
    repeat(steps) { link.operationDone(0) }
  }

  private fun linked(plan: LinkPlan = Rig.plan(subscriptions = listOf("ff04"), reads = listOf("ff02"))): BrushLink {
    val link = linkOf(plan)
    plan.subscriptions.forEach { radio.present += it.characteristic }
    plan.reads.forEach { radio.present += it.characteristic }
    link.start()
    link.connectionChanged(0, true)
    link.discovered(0)
    carry(link, plan.subscriptions.size)
    plan.reads.forEach { link.valueRead(Rig.uuidOf(it.characteristic.substring(4, 8)), byteArrayOf(1), 0) }
    radio.log.clear()
    return link
  }

  @Test
  fun `walks a plain gatt plan from connect through subscribe and read to linked`() {
    val plan = Rig.plan(subscriptions = listOf("ff04"), reads = listOf("ff02"))
    plan.subscriptions.forEach { radio.present += it.characteristic }
    plan.reads.forEach { radio.present += it.characteristic }
    val link = linkOf(plan)
    link.start()
    assertEquals(listOf("connect A4:C1:38:00:00:01 false"), radio.log)
    assertEquals(listOf("connecting"), listener.phases)
    link.connectionChanged(0, true)
    assertEquals(1, radio.discoveries)
    link.discovered(0)
    assertEquals(listOf("connect A4:C1:38:00:00:01 false", "subscribe ${Rig.uuid("ff04")}"), radio.log)
    assertFalse(link.ready)
    link.operationDone(0)
    assertEquals("read ${Rig.uuid("ff02")}", radio.log.last())
    link.valueRead(Rig.uuidOf("ff02"), byteArrayOf(7), 0)
    assertTrue(link.ready)
    assertEquals(listOf("connecting", "linked"), listener.phases)
    assertEquals(listOf(Rig.uuid("ff02")), listener.notes)
  }

  @Test
  fun `reports bluetooth off and a missing bond without connecting`() {
    radio.enabled = false
    linkOf(Rig.plan()).start()
    assertEquals(listOf("bluetooth_off"), listener.phases)
    assertEquals(1, listener.ended)
    assertTrue(radio.log.isEmpty())
  }

  @Test
  fun `only an urgent write jumps ahead of queued writes`() {
    val link = linked()
    link.write("first", byteArrayOf(1), false)
    link.write("second", byteArrayOf(2), false)
    link.write("answer", byteArrayOf(3), true)
    assertEquals(listOf("write first"), radio.log)
    link.operationDone(0)
    assertEquals(listOf("write first", "write answer"), radio.log)
    link.operationDone(0)
    assertEquals(listOf("write first", "write answer", "write second"), radio.log)
  }

  @Test
  fun `a refused write fails the whole step list and runs nothing after it`() {
    val link = linked()
    val steps = listOf<Step>(
      Step.Write(Rig.SERVICE, Rig.uuid("ff25"), "01", "with_response"),
      Step.Write(Rig.SERVICE, Rig.uuid("ff26"), "02", "with_response"),
      Step.Read(Rig.SERVICE, Rig.uuid("ff25"))
    )
    var answer: Pair<Boolean, String>? = null
    link.run(steps) { ok, detail -> answer = ok to detail }
    assertEquals(listOf("write ${Rig.uuid("ff25")}"), radio.log)
    link.operationDone(133)
    assertEquals(false, answer?.first)
    assertEquals(listOf("write ${Rig.uuid("ff25")}"), radio.log)
  }

  @Test
  fun `a write the radio cannot start fails the step list`() {
    val link = linked()
    radio.accepting = false
    var answer: Boolean? = null
    link.run(listOf(Step.Write(Rig.SERVICE, Rig.uuid("ff25"), "01", "with_response"))) { ok, _ -> answer = ok }
    assertEquals(false, answer)
  }

  @Test
  fun `a step list that succeeds reports success`() {
    val link = linked()
    var answer: Boolean? = null
    link.run(listOf(Step.Write(Rig.SERVICE, Rig.uuid("ff25"), "01", "with_response"))) { ok, _ -> answer = ok }
    link.operationDone(0)
    assertEquals(true, answer)
  }

  @Test
  fun `a stale cache is refreshed once and discovered again, never in a loop`() {
    val plan = Rig.plan(subscriptions = listOf("ff04"), reads = listOf("ff02"))
    val link = linkOf(plan)
    link.start()
    link.connectionChanged(0, true)
    assertEquals(1, radio.discoveries)
    link.discovered(0)
    assertEquals(1, radio.refreshes)
    assertEquals(2, radio.discoveries)
    link.discovered(0)
    assertEquals(1, radio.refreshes)
    assertEquals(2, radio.discoveries)
  }

  @Test
  fun `the cache is left alone when any vendor characteristic is present`() {
    val plan = Rig.plan(subscriptions = listOf("ff04"), reads = listOf("ff02"))
    radio.present += Rig.uuid("ff02")
    val link = linkOf(plan)
    link.start()
    link.connectionChanged(0, true)
    link.discovered(0)
    assertEquals(0, radio.refreshes)
    assertEquals(1, radio.discoveries)
  }

  @Test
  fun `a new connection may refresh once more`() {
    val plan = Rig.plan(reads = listOf("ff02"))
    val link = linkOf(plan)
    link.start()
    link.connectionChanged(0, true)
    link.discovered(0)
    link.connectionChanged(0, true)
    link.discovered(0)
    assertEquals(2, radio.refreshes)
  }

  @Test
  fun `a sync plan reads the sync list and disconnects without subscribing`() {
    val plan = Rig.plan(subscriptions = listOf("ff04"), reads = listOf("ff02"), sync = listOf("ff05", "ff0a"))
    plan.sync.forEach { radio.present += it.characteristic }
    val link = linkOf(plan, sync = true)
    link.start()
    link.connectionChanged(0, true)
    link.discovered(0)
    assertEquals("read ${Rig.uuid("ff05")}", radio.log.last())
    link.valueRead(Rig.uuidOf("ff05"), byteArrayOf(1), 0)
    assertEquals("read ${Rig.uuid("ff0a")}", radio.log.last())
    link.valueRead(Rig.uuidOf("ff0a"), byteArrayOf(2), 0)
    assertTrue(radio.closed)
    assertEquals(1, listener.ended)
    assertEquals(listOf(Rig.uuid("ff05"), Rig.uuid("ff0a")), listener.notes)
    assertEquals(listOf("connecting", "asleep"), listener.phases)
    assertTrue(radio.log.none { it.startsWith("subscribe") })
  }

  @Test
  fun `three quick drops report the brush as busy`() {
    val link = linkOf(Rig.plan())
    repeat(3) {
      link.start()
      now += 1_000
      link.connectionChanged(19, false)
    }
    assertEquals("busy", listener.phases.last())
  }
}
