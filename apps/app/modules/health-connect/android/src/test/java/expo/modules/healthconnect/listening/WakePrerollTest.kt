package expo.modules.healthconnect.listening

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class WakePrerollTest {
  @Test
  fun `the ring keeps only the newest samples in order`() {
    val preroll = WakePreroll(capacityMs = 1)
    preroll.push(ShortArray(10) { it.toShort() })
    preroll.push(ShortArray(10) { (10 + it).toShort() })
    assertArrayEquals(ShortArray(16) { (4 + it).toShort() }, preroll.take())
  }

  @Test
  fun `taking the preroll empties it`() {
    val preroll = WakePreroll()
    preroll.push(shortArrayOf(1, 2, 3))
    assertEquals(3, preroll.take().size)
    assertEquals(0, preroll.take().size)
  }

  @Test
  fun `the snippet level looks only at the requested tail`() {
    val preroll = WakePreroll()
    preroll.push(ShortArray(1600) { 20_000 })
    preroll.push(ShortArray(16) { 0 })
    assertEquals(LevelOf.FLOOR_DBFS, preroll.level(1), 0.0)
  }

  @Test
  fun `clearing forgets earlier audio`() {
    val preroll = WakePreroll()
    preroll.push(ShortArray(160) { 9_000 })
    preroll.clear()
    assertEquals(LevelOf.FLOOR_DBFS, preroll.level(10), 0.0)
  }

  @Test
  fun `a wake takes the sentence it came in, from its first word`() {
    val preroll = WakePreroll(WakePreroll.LOOKBACK_MS)
    val said = ShortArray(10 * 16_000) { (it % 1000).toShort() }
    preroll.push(said.copyOfRange(0, 16_000 * 2))
    preroll.sentenceBegan(16_000)
    preroll.push(said.copyOfRange(16_000 * 2, said.size))
    assertArrayEquals(said.copyOfRange(16_000, said.size), preroll.takeSentence())
    assertEquals(0, preroll.takeSentence().size)
  }

  @Test
  fun `a wake with no known sentence takes the default replay`() {
    val preroll = WakePreroll(WakePreroll.LOOKBACK_MS)
    preroll.push(ShortArray(10 * 16_000) { 5 })
    assertEquals(WakePreroll.REPLAY_MS * WakePreroll.SAMPLES_PER_MS, preroll.takeSentence().size)
  }

  @Test
  fun `a sentence longer than the lookback is cut to the lookback`() {
    val preroll = WakePreroll(WakePreroll.LOOKBACK_MS)
    preroll.push(ShortArray(2 * 16_000) { 1 })
    preroll.sentenceBegan(2 * 16_000)
    preroll.push(ShortArray(20 * 16_000) { 2 })
    assertEquals(WakePreroll.LOOKBACK_MS * WakePreroll.SAMPLES_PER_MS, preroll.takeSentence().size)
  }

  @Test
  fun `clearing forgets the sentence`() {
    val preroll = WakePreroll(WakePreroll.LOOKBACK_MS)
    preroll.push(ShortArray(10 * 16_000) { 5 })
    preroll.sentenceBegan(16_000)
    preroll.clear()
    preroll.push(ShortArray(10 * 16_000) { 5 })
    assertEquals(WakePreroll.REPLAY_MS * WakePreroll.SAMPLES_PER_MS, preroll.takeSentence().size)
  }
}
