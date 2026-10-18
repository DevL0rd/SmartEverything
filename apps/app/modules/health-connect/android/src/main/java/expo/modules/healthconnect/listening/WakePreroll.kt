package expo.modules.healthconnect.listening

class WakePreroll(capacityMs: Int = REPLAY_MS) {
  private val ring = ShortArray(capacityMs * SAMPLES_PER_MS)
  private var end = 0
  private var size = 0
  private var pushed = 0L
  private var sentenceStart: Long? = null

  @Synchronized
  fun push(pcm: ShortArray, count: Int = pcm.size) {
    for (index in 0 until count) {
      ring[end] = pcm[index]
      end = (end + 1) % ring.size
    }
    size = minOf(size + count, ring.size)
    pushed += count
  }

  @Synchronized
  fun sentenceBegan(backSamples: Int) {
    sentenceStart = pushed - backSamples
  }

  @Synchronized
  fun takeSentence(): ShortArray {
    val start = sentenceStart
    val wanted = if (start == null) REPLAY_MS * SAMPLES_PER_MS else (pushed - start).toInt()
    val out = tail(minOf(wanted, size))
    size = 0
    return out
  }

  @Synchronized
  fun level(ms: Int): Double = LevelOf.dbfs(tail(ms * SAMPLES_PER_MS))

  @Synchronized
  fun take(): ShortArray {
    val all = tail(size)
    size = 0
    return all
  }

  @Synchronized
  fun clear() {
    size = 0
    sentenceStart = null
  }

  private fun tail(wanted: Int): ShortArray {
    val count = minOf(wanted, size)
    val out = ShortArray(count)
    val start = (end - count + ring.size) % ring.size
    val first = minOf(count, ring.size - start)
    ring.copyInto(out, 0, start, start + first)
    ring.copyInto(out, first, 0, count - first)
    return out
  }

  companion object {
    const val REPLAY_MS = 3000
    const val LOOKBACK_MS = 15_000
    const val SAMPLES_PER_MS = 16
  }
}
