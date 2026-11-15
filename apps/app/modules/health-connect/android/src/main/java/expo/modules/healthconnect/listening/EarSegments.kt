package expo.modules.healthconnect.listening

import expo.modules.healthconnect.voice.SpeechHysteresis
import expo.modules.healthconnect.voice.VadMode

class EarSegments(
  pauseMs: Int,
  deliver: (Segment) -> Unit,
  private val clock: () -> Long = System::currentTimeMillis
) : AutoCloseable {
  private val hysteresis = SpeechHysteresis(MIN_SPEECH_MS, pauseMs)
  private val cutter = SegmentCutter(PAD_FRAMES, SHORTEST_FRAMES, LONGEST_FRAMES, deliver)

  @Synchronized
  fun hear(frames: List<VoiceFrame>) {
    for (frame in frames) {
      cutter.frame(frame.pcm, hysteresis.update(frame.voiced(MODE)), clock())
    }
  }

  @Synchronized
  override fun close() {
    cutter.flush(clock())
  }

  private companion object {
    val MODE = VadMode.NORMAL
    const val MIN_SPEECH_MS = 160
    const val PAD_FRAMES = 10
    const val SHORTEST_FRAMES = 13
    const val LONGEST_FRAMES = 937
  }
}
