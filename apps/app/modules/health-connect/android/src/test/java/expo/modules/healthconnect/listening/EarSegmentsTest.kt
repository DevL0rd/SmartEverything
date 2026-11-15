package expo.modules.healthconnect.listening

import org.junit.Assert.assertEquals
import org.junit.Test

class EarSegmentsTest {
  private var now = 0L

  private fun cut(pauseMs: Int, quietFrames: Int): List<Segment> {
    val cut = ArrayList<Segment>()
    val segments = EarSegments(pauseMs, { cut.add(it) }, { now })
    val voiced = (0 until 20).map { VoiceFrame(ShortArray(VoiceFrames.FRAME_SAMPLES), 0.9f) }
    val quiet = (0 until quietFrames).map { VoiceFrame(ShortArray(VoiceFrames.FRAME_SAMPLES), 0.1f) }
    segments.hear(voiced)
    segments.hear(quiet)
    val before = cut.size
    segments.close()
    return cut.take(before)
  }

  @Test
  fun `the voice detector waits the end-of-speech pause the hub sent`() {
    assertEquals(1, cut(640, 20).size)
    assertEquals(0, cut(2500, 20).size)
    assertEquals(1, cut(2500, 79).size)
  }

  @Test
  fun `a probability below the normal threshold is quiet`() {
    val cut = ArrayList<Segment>()
    val segments = EarSegments(640, { cut.add(it) }, { now })
    segments.hear((0 until 40).map { VoiceFrame(ShortArray(VoiceFrames.FRAME_SAMPLES), 0.49f) })
    segments.close()
    assertEquals(0, cut.size)
  }
}
