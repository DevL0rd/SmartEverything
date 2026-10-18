package expo.modules.healthconnect.listening

class EarIntake(
  private val ear: WakeEar?,
  private val segments: EarSegments?,
  private val levels: LevelMeter,
  private val counters: ListeningCounters
) {
  fun hear(pcm16k: ShortArray) {
    counters.heard(pcm16k.size)
    WakeReplay.keep(pcm16k)
    ear?.hear(pcm16k)
    segments?.hear(pcm16k)
    levels.hear(pcm16k)
  }
}
