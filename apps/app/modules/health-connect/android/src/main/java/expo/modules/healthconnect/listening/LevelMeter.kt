package expo.modules.healthconnect.listening

class LevelMeter(private val watched: () -> Boolean, private val report: (Double) -> Unit) {
  private val window = ShortArray(WINDOW_SAMPLES)
  private var filled = 0

  fun hear(pcm16k: ShortArray) {
    if (!watched()) {
      filled = 0
      return
    }
    var index = 0
    while (index < pcm16k.size) {
      val count = minOf(pcm16k.size - index, window.size - filled)
      pcm16k.copyInto(window, filled, index, index + count)
      filled += count
      index += count
      if (filled == window.size) {
        filled = 0
        report(LevelOf.dbfs(window))
      }
    }
  }

  companion object {
    const val WINDOW_SAMPLES = 1600
  }
}
