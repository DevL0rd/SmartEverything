package expo.modules.healthconnect.sonicare

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CondorTransportTest {
  private class Write(val characteristic: String, val bytes: ByteArray, val urgent: Boolean)

  private class Rig : CondorPort, CondorListener {
    val log = mutableListOf<String>()
    val writes = mutableListOf<Write>()
    val received = mutableListOf<ByteArray>()
    var ready = false
    var failure: String? = null

    override fun subscribe(characteristic: String) {
      log += "subscribe ${characteristic.take(8)}"
    }

    override fun write(characteristic: String, bytes: ByteArray, urgent: Boolean) {
      log += "write ${characteristic.take(8)}"
      writes += Write(characteristic, bytes, urgent)
    }

    override fun ready() {
      ready = true
    }

    override fun failed(reason: String) {
      failure = reason
    }

    override fun received(characteristic: String, value: ByteArray) {
      received += value
    }
  }

  private fun opened(rig: Rig): CondorTransport {
    val transport = CondorTransport(rig, rig)
    transport.start()
    transport.onServerConfig(byteArrayOf(4))
    transport.onServerConfig(byteArrayOf(20, 0, 20, 0, 20, 0))
    transport.onRxAck()
    return transport
  }

  private fun framed(type: Int, body: ByteArray = ByteArray(0), sequence: Int = 0): ByteArray =
    byteArrayOf(sequence.toByte()) + CondorTransport.frameOf(type, body)

  @Test
  fun `walks the handshake in the order the firmware needs`() {
    val rig = Rig()
    opened(rig)
    assertEquals(
      listOf(
        "subscribe e50b0006",
        "write e50b0007",
        "subscribe e50b0003",
        "subscribe e50b0002",
        "write e50b0007",
        "write e50b0001",
        "write e50b0001"
      ),
      rig.log
    )
    assertArrayEquals(byteArrayOf(3, 4), rig.writes[0].bytes)
    assertArrayEquals(byteArrayOf(-1, -1, -1, -1), rig.writes[1].bytes)
    assertArrayEquals(byteArrayOf(0x40), rig.writes[2].bytes)
    assertArrayEquals(byteArrayOf(1, -2, -1, 1, 0, 0), rig.writes[3].bytes)
  }

  @Test
  fun `is ready after the first answer to the initialize request`() {
    val rig = Rig()
    val transport = opened(rig)
    assertFalse(rig.ready)
    transport.onTx(framed(2))
    assertTrue(rig.ready)
    assertTrue(transport.isReady)
  }

  @Test
  fun `acks every notification at once with its sequence`() {
    val rig = Rig()
    val transport = opened(rig)
    val before = rig.writes.size
    transport.onTx(framed(2, sequence = 0xc5))
    val ack = rig.writes[before]
    assertEquals(CondorTransport.TX_ACK, ack.characteristic)
    assertTrue(ack.urgent)
    assertArrayEquals(byteArrayOf(5), ack.bytes)
  }

  @Test
  fun `answers a change indication without waiting and sends queued frames one at a time`() {
    val rig = Rig()
    val transport = opened(rig)
    transport.onTx(framed(2, sequence = 1))
    transport.send(CondorTransport.frameOf(4, byteArrayOf(49, 0)))
    transport.send(CondorTransport.frameOf(5, byteArrayOf(49, 0)))
    val afterFirst = rig.writes.count { it.characteristic == CondorTransport.RX }
    transport.onTx(framed(8, byteArrayOf(1, 2), sequence = 2))
    val response = rig.writes.last { it.characteristic == CondorTransport.RX }
    assertFalse(response.urgent)
    assertArrayEquals(CondorTransport.frameOf(9, byteArrayOf(0, 0)), response.bytes.copyOfRange(1, response.bytes.size))
    assertEquals(afterFirst + 1, rig.writes.count { it.characteristic == CondorTransport.RX })
    transport.onTx(framed(7, byteArrayOf(0), sequence = 3))
    assertEquals(afterFirst + 2, rig.writes.count { it.characteristic == CondorTransport.RX })
  }

  @Test
  fun `keeps the answer to a change indication behind the chunks of a frame already queued`() {
    val rig = Rig()
    val transport = opened(rig)
    transport.onTx(framed(2))
    val before = rig.writes.size
    transport.send(CondorTransport.frameOf(3, ByteArray(60)))
    transport.onTx(framed(8, byteArrayOf(1, 2), sequence = 2))
    val rx = rig.writes.drop(before).filter { it.characteristic == CondorTransport.RX }
    assertTrue(rx.none { it.urgent })
    val sequences = rx.map { it.bytes[0].toInt() and 0x3f }
    assertEquals(sequences.indices.map { sequences[0] + it }, sequences)
    assertArrayEquals(
      CondorTransport.frameOf(9, byteArrayOf(0, 0)),
      rx.last().bytes.copyOfRange(1, rx.last().bytes.size)
    )
  }

  @Test
  fun `splits a frame at nineteen payload bytes and counts the sequence round`() {
    val rig = Rig()
    val transport = opened(rig)
    transport.onTx(framed(2))
    val before = rig.writes.size
    transport.send(CondorTransport.frameOf(3, ByteArray(60)))
    val chunks = rig.writes.drop(before).filter { it.characteristic == CondorTransport.RX }
    assertEquals(listOf(20, 20, 20, 9), chunks.map { it.bytes.size })
    val first = chunks[0].bytes[0].toInt()
    assertEquals(listOf(first, first + 1, first + 2, first + 3), chunks.map { it.bytes[0].toInt() })
  }

  @Test
  fun `refuses a transport version it does not speak`() {
    val rig = Rig()
    val transport = CondorTransport(rig, rig)
    transport.start()
    transport.onServerConfig(byteArrayOf(3))
    assertTrue(rig.failure.orEmpty().contains("only version 4"))
  }

  @Test
  fun `refuses a stream that does not start with a frame mark`() {
    val rig = Rig()
    val transport = opened(rig)
    transport.onTx(byteArrayOf(1, 0, 0, 0, 0, 0, 0))
    assertTrue(rig.failure.orEmpty().contains("fe ff"))
  }

  @Test
  fun `passes every notification up unchanged for the hub to read`() {
    val rig = Rig()
    val transport = opened(rig)
    val notification = framed(2, byteArrayOf(9), sequence = 4)
    transport.onTx(notification)
    assertArrayEquals(notification, rig.received.single())
  }

  @Test
  fun `forgets the session when it is reset`() {
    val rig = Rig()
    val transport = opened(rig)
    transport.onTx(framed(2))
    transport.reset()
    assertFalse(transport.isReady)
  }
}
