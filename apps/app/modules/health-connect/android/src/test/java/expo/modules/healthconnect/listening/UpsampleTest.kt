package expo.modules.healthconnect.listening

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class UpsampleTest {
  @Test
  fun `each 16 kHz sample becomes three samples interpolated towards the next`() {
    assertArrayEquals(shortArrayOf(0, 100, 200, 300, 300, 300), Upsample.to48k(shortArrayOf(0, 300)))
  }

  @Test
  fun `the replay is cut into whole 20 ms frames and the last one is padded with silence`() {
    val frames = Upsample.frames(ShortArray(1000) { 5 })
    assertEquals(2, frames.size)
    assertEquals(960, frames[0].size)
    assertEquals(960, frames[1].size)
    assertEquals(5, frames[1][39].toInt())
    assertEquals(0, frames[1][40].toInt())
  }

  @Test
  fun `no audio gives no frames`() {
    assertEquals(0, Upsample.frames(ShortArray(0)).size)
  }
}
