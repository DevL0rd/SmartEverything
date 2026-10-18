package expo.modules.healthconnect.listening

import android.content.Context
import expo.modules.healthconnect.voice.SileroVad
import expo.modules.healthconnect.voice.SpeechVadFactory
import expo.modules.healthconnect.voice.VadMode

class EarSegments(
  context: Context,
  pauseMs: Int,
  deliver: (Segment) -> Unit,
  private val clock: () -> Long = System::currentTimeMillis,
  vads: SpeechVadFactory = ::SileroVad
) : AutoCloseable {
  private val vad = vads(context, VadMode.NORMAL, MIN_SPEECH_MS, pauseMs)
  private val cutter = SegmentCutter(PAD_FRAMES, SHORTEST_FRAMES, LONGEST_FRAMES, deliver)
  private val frame = ShortArray(SegmentCutter.FRAME_SAMPLES)
  private var filled = 0

  @Synchronized
  fun hear(pcm16k: ShortArray) {
    var index = 0
    while (index < pcm16k.size) {
      val count = minOf(pcm16k.size - index, frame.size - filled)
      pcm16k.copyInto(frame, filled, index, index + count)
      filled += count
      index += count
      if (filled == frame.size) {
        filled = 0
        cutter.frame(frame.copyOf(), vad.isSpeech(frame), clock())
      }
    }
  }

  @Synchronized
  override fun close() {
    cutter.flush(clock())
    vad.close()
  }

  private companion object {
    const val MIN_SPEECH_MS = 160
    const val PAD_FRAMES = 10
    const val SHORTEST_FRAMES = 13
    const val LONGEST_FRAMES = 937
  }
}
