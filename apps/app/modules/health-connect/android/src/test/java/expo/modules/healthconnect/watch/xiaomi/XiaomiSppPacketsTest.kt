package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.expectIs
import expo.modules.healthconnect.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiSppPacketsTest {
  @Test
  fun `v1 encode produces the documented frame layout`() {
    val frame = SppV1.encode(XiaomiChannel.COMMAND, SppV1.OPCODE_SEND, 7, SppV1.DATA_ENCRYPTED, hex("aa bb"), true)
    assertArrayEquals(hex("badcfe 02 c0 0500 02 07 01 aabb ef"), frame)
  }

  @Test
  fun `v1 parse reads back what encode wrote`() {
    val frame = SppV1.encode(XiaomiChannel.ACTIVITY, SppV1.OPCODE_READ, 1, SppV1.DATA_PLAIN, hex("01 02 03"), false)
    val parsed = SppV1.parse(frame).complete()
    val v1 = parsed.frame.expectIs<Frame.V1>()
    assertEquals(frame.size, parsed.size)
    assertEquals(XiaomiChannel.ACTIVITY, v1.channel)
    assertEquals(SppV1.DATA_PLAIN, v1.dataType)
    assertArrayEquals(hex("010203"), v1.payload)
  }

  @Test
  fun `v1 parse reports the size so the caller can consume two frames in one buffer`() {
    val first = SppV1.encode(XiaomiChannel.VERSION, 0, 1, 0, hex("01"), false)
    val second = SppV1.encode(XiaomiChannel.DATA, 0, 2, 0, hex("0203"), false)
    val parsed = SppV1.parse(first + second).complete()
    assertEquals(first.size, parsed.size)
  }

  @Test
  fun `v1 parse waits for more bytes when the frame is short`() {
    val frame = SppV1.encode(XiaomiChannel.COMMAND, 2, 1, 1, hex("0102030405"), false)
    assertTrue(SppV1.parse(frame.copyOf(5)) is Parsed.Incomplete)
    assertTrue(SppV1.parse(frame.copyOf(frame.size - 1)) is Parsed.Incomplete)
  }

  @Test
  fun `v1 parse rejects a wrong preamble and a wrong epilogue`() {
    val frame = SppV1.encode(XiaomiChannel.COMMAND, 2, 1, 1, hex("01"), false)
    assertTrue(SppV1.parse(frame.copyOf().also { it[0] = 0 }) is Parsed.Invalid)
    assertTrue(SppV1.parse(frame.copyOf().also { it[it.size - 1] = 0 }) is Parsed.Invalid)
  }

  @Test
  fun `v1 channels map to the raw nibble and back`() {
    assertEquals(0, SppV1.rawChannel(XiaomiChannel.VERSION))
    assertEquals(2, SppV1.rawChannel(XiaomiChannel.COMMAND))
    assertEquals(2, SppV1.rawChannel(XiaomiChannel.AUTHENTICATION))
    assertEquals(3, SppV1.rawChannel(XiaomiChannel.ACTIVITY))
    assertEquals(5, SppV1.rawChannel(XiaomiChannel.DATA))
    val unknown = SppV1.encode(XiaomiChannel.UNKNOWN, 0, 0, 0, ByteArray(0), false)
    assertEquals(XiaomiChannel.UNKNOWN, (SppV1.parse(unknown).complete().frame.expectIs<Frame.V1>()).channel)
  }

  @Test
  fun `v1 next start skips to the following preamble byte`() {
    assertEquals(3, SppV1.nextStart(hex("00 11 22 ba 33")))
    assertEquals(4, SppV1.nextStart(hex("ba 11 22 33")))
  }

  @Test
  fun `crc16 matches the CRC-16 ARC check value`() {
    assertEquals(0xbb3d, SppV2.crc16("123456789".toByteArray(Charsets.US_ASCII)))
    assertEquals(0, SppV2.crc16(ByteArray(0)))
  }

  @Test
  fun `v2 frame carries preamble type sequence length and checksum`() {
    val frame = SppV2.frame(SppV2.TYPE_DATA, 9, hex("01 02"))
    val crc = SppV2.crc16(hex("0102"))
    val expected = hex("a5a5 03 09 0200") + byteArrayOf((crc and 0xff).toByte(), (crc shr 8).toByte()) + hex("0102")
    assertArrayEquals(expected, frame)
  }

  @Test
  fun `v2 parse reads a data frame and splits channel opcode and payload`() {
    val inner = hex("01 02 aa bb cc")
    val frame = SppV2.frame(SppV2.TYPE_DATA, 4, inner)
    val parsed = SppV2.parse(frame).complete()
    val data = parsed.frame.expectIs<Frame.Data>()
    assertEquals(frame.size, parsed.size)
    assertEquals(4, data.sequence)
    assertEquals(XiaomiChannel.COMMAND, data.channel)
    assertEquals(SppV2.OPCODE_ENCRYPTED, data.opCode)
    assertArrayEquals(hex("aabbcc"), data.payload)
  }

  @Test
  fun `v2 parse reads ack nack and session frames`() {
    assertEquals(3, SppV2.parse(SppV2.frame(SppV2.TYPE_ACK, 3, ByteArray(0))).frameOf().expectIs<Frame.Ack>().sequence)
    assertEquals(5, SppV2.parse(SppV2.frame(SppV2.TYPE_NACK, 5, ByteArray(0))).frameOf().expectIs<Frame.Nack>().sequence)
    val session = SppV2.parse(SppV2.frame(SppV2.TYPE_SESSION, 0, SppV2.SESSION_CONFIG)).frameOf().expectIs<Frame.SessionConfig>()
    assertEquals(SppV2.START_SESSION, session.opCode)
  }

  @Test
  fun `v2 parse drops a frame whose checksum is wrong but still reports its size`() {
    val frame = SppV2.frame(SppV2.TYPE_DATA, 1, hex("01 02 03")).also { it[it.size - 1] = 0 }
    val parsed = SppV2.parse(frame).complete()
    assertEquals(frame.size, parsed.size)
    assertEquals(null, parsed.frame)
  }

  @Test
  fun `v2 parse waits for more bytes and rejects a wrong preamble`() {
    val frame = SppV2.frame(SppV2.TYPE_DATA, 1, hex("01 02 03"))
    assertTrue(SppV2.parse(frame.copyOf(7)) is Parsed.Incomplete)
    assertTrue(SppV2.parse(frame.copyOf(frame.size - 1)) is Parsed.Incomplete)
    assertTrue(SppV2.parse(frame.copyOf().also { it[1] = 0 }) is Parsed.Invalid)
  }

  @Test
  fun `v2 channels and opcodes pair up for each logical channel`() {
    assertEquals(1, SppV2.rawChannel(XiaomiChannel.COMMAND))
    assertEquals(2, SppV2.rawChannel(XiaomiChannel.DATA))
    assertEquals(5, SppV2.rawChannel(XiaomiChannel.ACTIVITY))
    assertEquals(SppV2.OPCODE_ENCRYPTED, SppV2.opCodeFor(XiaomiChannel.COMMAND))
    assertEquals(SppV2.OPCODE_ENCRYPTED, SppV2.opCodeFor(XiaomiChannel.ACTIVITY))
    assertEquals(SppV2.OPCODE_PLAIN, SppV2.opCodeFor(XiaomiChannel.DATA))
    assertEquals(SppV2.OPCODE_PLAIN, SppV2.opCodeFor(XiaomiChannel.AUTHENTICATION))
  }

  @Test
  fun `v2 next start skips to the following preamble byte`() {
    assertEquals(2, SppV2.nextStart(hex("00 11 a5 33")))
    assertEquals(3, SppV2.nextStart(hex("a5 11 22")))
  }

  private fun Parsed.frameOf(): Frame? = complete().frame
}
