package expo.modules.healthconnect.listening

import org.junit.Assert.assertEquals
import org.junit.Test

class SegmentCutterTest {
  private val cut = ArrayList<Segment>()
  private val cutter = SegmentCutter(padFrames = 2, shortestFrames = 3, longestFrames = 8) { cut.add(it) }

  private fun frame(value: Int) = ShortArray(SegmentCutter.FRAME_SAMPLES) { value.toShort() }

  private fun feed(pattern: String, startMs: Long = 0) {
    pattern.forEachIndexed { index, mark ->
      cutter.frame(frame(index + 1), mark == 'x', startMs + index * SegmentCutter.FRAME_MS)
    }
  }

  @Test
  fun `speech is cut when it ends and keeps a little lead-in`() {
    feed("--xxxx-")
    assertEquals(1, cut.size)
    val segment = cut[0]
    assertEquals(6 * SegmentCutter.FRAME_SAMPLES, segment.pcm.size)
    assertEquals(1, segment.pcm[0].toInt())
    assertEquals(0L, segment.startedAtMs)
    assertEquals(6 * SegmentCutter.FRAME_MS, segment.endedAtMs)
  }

  @Test
  fun `a blip shorter than the shortest segment is dropped`() {
    feed("x-x-")
    assertEquals(0, cut.size)
  }

  @Test
  fun `long speech is delivered in pieces`() {
    feed("xxxxxxxxxx-")
    assertEquals(1, cut.size)
    assertEquals(8, cut[0].pcm.size / SegmentCutter.FRAME_SAMPLES)
  }

  @Test
  fun `flushing delivers speech still in progress`() {
    feed("xxxx")
    cutter.flush(500)
    assertEquals(1, cut.size)
    assertEquals(4, cut[0].pcm.size / SegmentCutter.FRAME_SAMPLES)
  }
}
