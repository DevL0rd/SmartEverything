package expo.modules.healthconnect.watch

import expo.modules.healthconnect.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ProtoWireTest {
  @Test
  fun `a varint field encodes like the protobuf reference example`() {
    assertArrayEquals(hex("08 96 01"), ProtoWriter().varint(1, 150).toByteArray())
  }

  @Test
  fun `a string field encodes like the protobuf reference example`() {
    assertArrayEquals(hex("12 07 74 65 73 74 69 6e 67"), ProtoWriter().string(2, "testing").toByteArray())
  }

  @Test
  fun `a nested message encodes like the protobuf reference example`() {
    val inner = ProtoWriter().varint(1, 150)
    assertArrayEquals(hex("1a 03 08 96 01"), ProtoWriter().message(3, inner).toByteArray())
  }

  @Test
  fun `varints round trip across byte boundaries`() {
    listOf(0L, 1L, 127L, 128L, 300L, 16_383L, 16_384L, 0xffffffffL, Long.MAX_VALUE, -1L).forEach { value ->
      val parsed = parseProto(ProtoWriter().varint(5, value).toByteArray())
      assertEquals(value, parsed.varint(5))
    }
  }

  @Test
  fun `sint zigzag encodes small magnitudes as small varints`() {
    assertEquals(0L, parseProto(ProtoWriter().sint(1, 0).toByteArray()).varint(1))
    assertEquals(1L, parseProto(ProtoWriter().sint(1, -1).toByteArray()).varint(1))
    assertEquals(2L, parseProto(ProtoWriter().sint(1, 1).toByteArray()).varint(1))
    assertEquals(0xffffffffL, parseProto(ProtoWriter().sint(1, Int.MIN_VALUE).toByteArray()).varint(1))
  }

  @Test
  fun `strings bytes and nested messages round trip`() {
    val bytes = byteArrayOf(0, 1, 2, -1)
    val wire = ProtoWriter()
      .string(1, "Mi Band £")
      .bytes(2, bytes)
      .message(3, ProtoWriter().varint(1, 7).string(2, "inner"))
      .toByteArray()
    val parsed = parseProto(wire)
    assertEquals("Mi Band £", parsed.string(1))
    assertArrayEquals(bytes, parsed.bytes(2))
    assertEquals(7, parsed.message(3)?.int(1))
    assertEquals("inner", parsed.message(3)?.string(2))
  }

  @Test
  fun `a float field reads back as its little endian bit pattern`() {
    val parsed = parseProto(ProtoWriter().float(4, 1.5f).toByteArray())
    assertEquals(1.5f, Float.fromBits(checkNotNull(parsed.varint(4)).toInt()), 0f)
  }

  @Test
  fun `a fixed64 field reads back as a long`() {
    val parsed = parseProto(hex("09 01 02 03 04 05 06 07 08"))
    assertEquals(0x0807060504030201L, parsed.varint(1))
  }

  @Test
  fun `repeated fields keep every value and a scalar read takes the last`() {
    val wire = ProtoWriter().varint(1, 1).varint(1, 2).string(2, "a").string(2, "b").toByteArray()
    val parsed = parseProto(wire)
    assertEquals(2L, parsed.varint(1))
    assertEquals(listOf("a", "b"), parsed.all(2).map { it.toString(Charsets.UTF_8) })
    assertEquals(setOf(1, 2), parsed.fieldNumbers())
  }

  @Test
  fun `bool int and presence read from the field`() {
    val parsed = parseProto(ProtoWriter().varint(1, 1).varint(2, 0).toByteArray())
    assertEquals(true, parsed.bool(1))
    assertEquals(false, parsed.bool(2))
    assertTrue(parsed.has(1))
    assertFalse(parsed.has(3))
    assertNull(parsed.bool(3))
    assertNull(parsed.string(1))
  }

  @Test
  fun `an empty buffer parses to an empty message`() {
    assertTrue(parseProto(ByteArray(0)).fieldNumbers().isEmpty())
  }

  @Test
  fun `a varint that runs past the end is rejected`() {
    assertMalformed(hex("08 96"))
  }

  @Test
  fun `a varint longer than ten bytes is rejected`() {
    assertMalformed(hex("08 ff ff ff ff ff ff ff ff ff ff ff 01"))
  }

  @Test
  fun `a length that overruns the buffer is rejected`() {
    assertMalformed(hex("12 05 61 62"))
  }

  @Test
  fun `a negative length is rejected`() {
    assertMalformed(hex("12 ff ff ff ff ff ff ff ff ff 01"))
  }

  @Test
  fun `a truncated fixed32 is rejected`() {
    assertMalformed(hex("0d 01 02"))
  }

  @Test
  fun `an unsupported wire type is rejected`() {
    assertMalformed(hex("0b 00"))
  }

  private fun assertMalformed(bytes: ByteArray) {
    try {
      parseProto(bytes)
      fail("expected ProtoFormatError")
    } catch (error: ProtoFormatError) {
      assertTrue(error.message.orEmpty().startsWith("Malformed protobuf"))
    }
  }
}
