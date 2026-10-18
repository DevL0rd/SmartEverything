package expo.modules.healthconnect.listening

object WakeReplay {
  const val LIMIT_MS = 15_000

  private val held = ArrayList<ShortArray>()
  private var samples = 0
  private var active = false

  @Synchronized
  fun begin(preroll: ShortArray) {
    held.clear()
    held.add(preroll.copyOf())
    samples = preroll.size
    active = true
  }

  @Synchronized
  fun keep(pcm16k: ShortArray) {
    if (!active) {
      return
    }
    held.add(pcm16k.copyOf())
    samples += pcm16k.size
    if (samples > LIMIT_MS * WakePreroll.SAMPLES_PER_MS) {
      release()
    }
  }

  @Synchronized
  fun holding(): Boolean = active

  @Synchronized
  fun release() {
    held.clear()
    samples = 0
    active = false
  }

  @Synchronized
  fun take(): ShortArray {
    val all = ShortArray(samples)
    var at = 0
    for (part in held) {
      part.copyInto(all, at)
      at += part.size
    }
    release()
    return all
  }
}
