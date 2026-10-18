package expo.modules.healthconnect.listening

import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WakeReplayTest {
  @After
  fun forget() = WakeReplay.release()

  @Test
  fun `the preroll and everything heard after the wake come back in order`() {
    WakeReplay.begin(shortArrayOf(1, 2))
    WakeReplay.keep(shortArrayOf(3))
    WakeReplay.keep(shortArrayOf(4, 5))
    assertArrayEquals(shortArrayOf(1, 2, 3, 4, 5), WakeReplay.take())
    assertFalse(WakeReplay.holding())
  }

  @Test
  fun `audio is not kept unless a wake began a hold`() {
    WakeReplay.keep(shortArrayOf(9, 9))
    assertEquals(0, WakeReplay.take().size)
  }

  @Test
  fun `a hold that runs past the limit is dropped`() {
    WakeReplay.begin(ShortArray(0))
    WakeReplay.keep(ShortArray(WakeReplay.LIMIT_MS * WakePreroll.SAMPLES_PER_MS + 1))
    assertFalse(WakeReplay.holding())
    assertEquals(0, WakeReplay.take().size)
  }

  @Test
  fun `the hold copies what it is given`() {
    val frame = shortArrayOf(7, 7)
    WakeReplay.begin(ShortArray(0))
    WakeReplay.keep(frame)
    frame[0] = 0
    assertArrayEquals(shortArrayOf(7, 7), WakeReplay.take())
  }

  @Test
  fun `releasing ends the hold`() {
    WakeReplay.begin(shortArrayOf(1))
    assertTrue(WakeReplay.holding())
    WakeReplay.release()
    assertFalse(WakeReplay.holding())
  }
}
