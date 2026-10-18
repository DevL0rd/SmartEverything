package expo.modules.healthconnect.voice

import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.assertEquals
import org.junit.Test

class OutputLevelTest {
  private fun bytes(samples: ShortArray): ByteArray {
    val buffer = ByteBuffer.allocate(samples.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    buffer.asShortBuffer().put(samples)
    return buffer.array()
  }

  @Test
  fun `decoded output uses the same level formula as the microphone`() {
    val samples = shortArrayOf(1200, -3400, 5600, -7800, 32767, -32768, 0, 15)
    assertEquals(PcmLevel.of(samples), PcmLevel.ofLittleEndian(bytes(samples), samples.size * 2), 1e-12)
  }

  @Test
  fun `silence is zero and loud audio is capped at one`() {
    assertEquals(0.0, PcmLevel.ofLittleEndian(ByteArray(64), 64), 0.0)
    assertEquals(1.0, PcmLevel.of(ShortArray(16) { 20000 }), 0.0)
  }

  @Test
  fun `a quiet signal follows rms times four over full scale`() {
    assertEquals(4096.0 / 32768.0 * 4.0, PcmLevel.of(ShortArray(8) { 4096 }), 1e-12)
  }
}
