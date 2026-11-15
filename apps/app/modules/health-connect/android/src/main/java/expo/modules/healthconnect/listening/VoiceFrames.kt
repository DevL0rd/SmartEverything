package expo.modules.healthconnect.listening

import expo.modules.healthconnect.voice.SileroModel
import expo.modules.healthconnect.voice.VadMode
import expo.modules.healthconnect.voice.VoiceProbability

class VoiceFrame(val pcm: ShortArray, val probability: Float) {
  fun voiced(mode: VadMode): Boolean = probability >= mode.threshold
}

class VoiceFrames(private val model: VoiceProbability) : AutoCloseable {
  private val frame = ShortArray(FRAME_SAMPLES)
  private var filled = 0
  private var closed = false

  @Synchronized
  fun split(pcm16k: ShortArray): List<VoiceFrame> {
    if (closed) {
      return emptyList()
    }
    val frames = ArrayList<VoiceFrame>(1)
    var index = 0
    while (index < pcm16k.size) {
      val count = minOf(pcm16k.size - index, frame.size - filled)
      pcm16k.copyInto(frame, filled, index, index + count)
      filled += count
      index += count
      if (filled == frame.size) {
        filled = 0
        frames.add(VoiceFrame(frame.copyOf(), model.probability(frame)))
      }
    }
    return frames
  }

  @Synchronized
  fun restart() {
    filled = 0
    model.reset()
  }

  @Synchronized
  override fun close() {
    if (!closed) {
      closed = true
      model.close()
    }
  }

  companion object {
    const val FRAME_SAMPLES = SileroModel.WINDOW
  }
}
