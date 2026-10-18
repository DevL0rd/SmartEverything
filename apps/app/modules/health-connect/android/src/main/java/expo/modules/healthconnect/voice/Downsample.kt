package expo.modules.healthconnect.voice

class Downsample {
  private val out = ShortArray(VoiceCapture.FRAME_SAMPLES / RATIO)

  fun to16k(pcm: ShortArray): ShortArray {
    val count = pcm.size / RATIO
    val target = if (count == out.size) out else ShortArray(count)
    for (index in 0 until count) {
      val at = index * RATIO
      target[index] = ((pcm[at] + pcm[at + 1] + pcm[at + 2]) / RATIO).toShort()
    }
    return target
  }

  private companion object {
    const val RATIO = VoiceCapture.SAMPLE_RATE / 16_000
  }
}
