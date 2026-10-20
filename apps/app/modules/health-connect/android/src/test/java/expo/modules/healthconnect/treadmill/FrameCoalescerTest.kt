package expo.modules.healthconnect.treadmill

import java.time.Instant
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FrameCoalescerTest {
  private val status = LinkDelivery("fe00", "fe01", "notify", "f8a2", 2)
  private val machine = LinkDelivery("1826", "2ada", "notify", null, null)
  private val data = LinkDelivery("1826", "2acd", "notify", "", null)
  private val coalescer = FrameCoalescer(listOf(status, machine, data)) { Instant.parse("2026-10-18T10:00:00Z") }

  private fun frame(vararg bytes: Int): ByteArray = ByteArray(bytes.size) { bytes[it].toByte() }

  @Test
  fun `a telemetry frame waits for the second and only the latest one is kept`() {
    assertNull(coalescer.accept("fe01", frame(0xf8, 0xa2, 1, 10)))
    assertNull(coalescer.accept("fe01", frame(0xf8, 0xa2, 1, 20)))
    val drained = coalescer.drain()
    assertEquals(1, drained.size)
    assertEquals("f8a20114", drained[0].hex)
    assertFalse(coalescer.pending())
  }

  @Test
  fun `a change of the state byte goes out at once`() {
    assertNull(coalescer.accept("fe01", frame(0xf8, 0xa2, 1, 10)))
    val immediate = coalescer.accept("fe01", frame(0xf8, 0xa2, 5, 10))
    assertNotNull(immediate)
    assertEquals("f8a2050a", immediate!!.hex)
    assertTrue(coalescer.drain().isEmpty())
  }

  @Test
  fun `a frame that is not telemetry goes out at once`() {
    assertNotNull(coalescer.accept("fe01", frame(0xf8, 0xa6, 0)))
    assertNotNull(coalescer.accept("2ada", frame(0x03)))
  }

  @Test
  fun `an empty prefix coalesces everything the characteristic sends`() {
    assertNull(coalescer.accept("2acd", frame(0x04, 0x24)))
    assertEquals(1, coalescer.drain().size)
  }

  @Test
  fun `a characteristic the plan does not name is ignored`() {
    assertNull(coalescer.accept("ffff", frame(1)))
    assertTrue(coalescer.drain().isEmpty())
  }

  @Test
  fun `hex goes both ways`() {
    assertEquals("00ff10", TreadmillHex.of(frame(0, 255, 16)))
    assertArrayEquals(frame(0, 255, 16), TreadmillHex.bytes("00ff10"))
  }
}
