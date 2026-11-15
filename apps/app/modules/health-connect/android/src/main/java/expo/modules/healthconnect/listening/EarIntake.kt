package expo.modules.healthconnect.listening

class EarIntake(
  private val voice: VoiceFrames?,
  private val ear: WakeEar?,
  private val segments: EarSegments?,
  private val levels: LevelMeter,
  private val counters: ListeningCounters
) {
  init {
    require(voice != null || (ear == null && segments == null)) { "the wake ear and the write-down need the shared voice detector" }
  }

  fun hear(pcm16k: ShortArray) {
    counters.heard(pcm16k.size)
    WakeReplay.keep(pcm16k)
    voice?.split(pcm16k)?.let { frames ->
      ear?.hear(pcm16k, frames)
      segments?.hear(frames)
    }
    levels.hear(pcm16k)
  }
}
