package expo.modules.healthconnect.listening

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class VoiceGateTest {
  private val frame = VoiceGate.FRAME_SAMPLES
  private val counters = ListeningCounters({ 0 }, {})
  private val fed = ArrayList<Short>()
  private var restarts = 0
  private var voiced = false
  private val gate = VoiceGate({ voiced }, counters, { restarts += 1 }, { chunk -> chunk.forEach { fed.add(it) } })
  private var heard = 0

  private fun hear(samples: Int, voice: Boolean, chunk: Int = frame) {
    var left = samples
    while (left > 0) {
      val size = minOf(chunk, left)
      voiced = voice
      gate.hear(ShortArray(size) { (heard + it).toShort() })
      heard += size
      left -= size
    }
  }

  private fun expected(from: Int, to: Int) = ShortArray(to - from) { (from + it).toShort() }

  @Test
  fun `silence never reaches the spotter`() {
    hear(frame * 100, voice = false)
    assertEquals(0, fed.size)
    assertEquals(0, restarts)
  }

  @Test
  fun `voice opens the gate and the audio before it is replayed in order`() {
    hear(frame * 10, voice = false)
    hear(frame, voice = true)
    assertArrayEquals(expected(0, frame * 11), fed.toShortArray())
    assertEquals(1, restarts)
  }

  @Test
  fun `the replay reaches back only as far as the preroll`() {
    hear(frame * 100, voice = false)
    hear(frame, voice = true)
    val reach = 640 * WakePreroll.SAMPLES_PER_MS
    assertArrayEquals(expected(frame * 101 - reach, frame * 101), fed.toShortArray())
  }

  @Test
  fun `an open gate forwards each chunk in the call that delivered it`() {
    hear(frame * 4, voice = true, chunk = 320)
    var lag = 0
    repeat(30) {
      hear(320, voice = true, chunk = 320)
      lag = maxOf(lag, heard - fed.size)
    }
    assertEquals(0, lag)
  }

  @Test
  fun `the gate stays open through a short pause and closes after the hangover`() {
    hear(frame * 4, voice = true)
    val before = fed.size
    hear(frame * VoiceGate.HANGOVER_FRAMES, voice = false)
    assertEquals(before + frame * VoiceGate.HANGOVER_FRAMES, fed.size)
    hear(frame * 5, voice = false)
    assertEquals(before + frame * VoiceGate.HANGOVER_FRAMES, fed.size)
  }

  @Test
  fun `voice returning inside the preroll continues the same audio without a restart`() {
    hear(frame * 4, voice = true)
    hear(frame * (VoiceGate.HANGOVER_FRAMES + 6), voice = false)
    hear(frame, voice = true)
    assertArrayEquals(expected(0, heard), fed.toShortArray())
    assertEquals(1, restarts)
  }

  @Test
  fun `voice returning after a long silence restarts the spotter and skips the gap`() {
    hear(frame * 4, voice = true)
    hear(frame * 200, voice = false)
    hear(frame, voice = true)
    assertEquals(2, restarts)
    val reach = 640 * WakePreroll.SAMPLES_PER_MS
    assertTrue(fed.size < heard)
    assertArrayEquals(expected(heard - reach, heard), fed.takeLast(reach).toShortArray())
  }

  @Test
  fun `resting closes the gate and forgets the preroll`() {
    hear(frame * 10, voice = false)
    gate.rest()
    hear(frame, voice = true)
    assertArrayEquals(expected(frame * 10, frame * 11), fed.toShortArray())
    assertEquals(1, restarts)
  }

  @Test
  fun `counters tell how much audio the spotter saw`() {
    hear(frame * 10, voice = false)
    hear(frame, voice = true)
    val snapshot = counters.snapshot()
    assertEquals(1.0, snapshot.getValue("voiceOpens"), 0.0)
    assertEquals(1.0, snapshot.getValue("spotterRuns"), 0.0)
    assertEquals(frame * 11 / 16_000.0, snapshot.getValue("spotterSeconds"), 1e-9)
  }

  @Test
  fun `opening reports how far back the sentence reaches, once per sentence`() {
    val opened = ArrayList<Int>()
    val reporting = VoiceGate({ voiced }, counters, {}, {}, opened = { opened.add(it) })
    voiced = false
    repeat(100) { reporting.hear(ShortArray(frame)) }
    voiced = true
    repeat(4) { reporting.hear(ShortArray(frame)) }
    assertEquals(listOf(640 * WakePreroll.SAMPLES_PER_MS), opened)
  }
}
