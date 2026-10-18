package expo.modules.healthconnect.listening

import expo.modules.healthconnect.voice.VoiceCapture

object Upsample {
  const val RATIO = VoiceCapture.SAMPLE_RATE / 16_000

  fun to48k(pcm: ShortArray): ShortArray {
    val out = ShortArray(pcm.size * RATIO)
    for (index in pcm.indices) {
      val from = pcm[index].toInt()
      val to = if (index + 1 < pcm.size) pcm[index + 1].toInt() else from
      for (step in 0 until RATIO) {
        out[index * RATIO + step] = (from + (to - from) * step / RATIO).toShort()
      }
    }
    return out
  }

  fun frames(pcm48k: ShortArray): List<ShortArray> =
    (pcm48k.indices step VoiceCapture.FRAME_SAMPLES).map { start ->
      pcm48k.copyOfRange(start, minOf(start + VoiceCapture.FRAME_SAMPLES, pcm48k.size)).copyOf(VoiceCapture.FRAME_SAMPLES)
    }
}
