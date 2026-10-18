package expo.modules.healthconnect.voice

import org.junit.Assert.assertArrayEquals
import org.junit.Test

class DownsampleTest {
  @Test
  fun `three samples at 48 kHz become their mean at 16 kHz`() {
    val frame = ShortArray(960) { it.toShort() }
    assertArrayEquals(ShortArray(320) { (3 * it + 1).toShort() }, Downsample().to16k(frame))
  }
}
