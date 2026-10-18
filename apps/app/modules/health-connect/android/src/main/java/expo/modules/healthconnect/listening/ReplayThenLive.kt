package expo.modules.healthconnect.listening

import expo.modules.healthconnect.voice.VoiceCapture

class ReplayThenLive(
  private val sink: (ShortArray) -> Unit,
  private val take: () -> ShortArray = WakeReplay::take
) {
  private val waiting = ArrayList<ShortArray>()
  private var replaying = true

  @Synchronized
  fun live(pcm: ShortArray) {
    if (replaying) waiting.add(pcm) else sink(pcm)
  }

  @Synchronized
  fun replay() {
    if (!replaying) {
      return
    }
    val earlier = take()
    val overlap = waiting.size * (VoiceCapture.FRAME_SAMPLES / Upsample.RATIO)
    val words = earlier.copyOf(maxOf(0, earlier.size - overlap))
    Upsample.frames(Upsample.to48k(words)).forEach(sink)
    waiting.forEach(sink)
    waiting.clear()
    replaying = false
  }
}
