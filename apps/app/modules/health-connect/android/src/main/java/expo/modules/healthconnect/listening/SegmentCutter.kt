package expo.modules.healthconnect.listening

class Segment(val pcm: ShortArray, val startedAtMs: Long, val endedAtMs: Long)

class SegmentCutter(
  private val padFrames: Int,
  private val shortestFrames: Int,
  private val longestFrames: Int,
  private val deliver: (Segment) -> Unit
) {
  private val before = ArrayDeque<ShortArray>()
  private var current: ArrayList<ShortArray>? = null
  private var startedAt = 0L

  fun frame(pcm: ShortArray, speech: Boolean, nowMs: Long) {
    if (speech) {
      onSpeech(pcm, nowMs)
    } else {
      onQuiet(pcm, nowMs)
    }
  }

  fun flush(nowMs: Long) {
    finish(nowMs)
    before.clear()
  }

  private fun onSpeech(pcm: ShortArray, nowMs: Long) {
    val open = current ?: begin(nowMs)
    open.add(pcm)
    if (open.size >= longestFrames) {
      finish(nowMs)
    }
  }

  private fun begin(nowMs: Long): ArrayList<ShortArray> {
    startedAt = nowMs - before.size * FRAME_MS
    return ArrayList(before).also {
      before.clear()
      current = it
    }
  }

  private fun onQuiet(pcm: ShortArray, nowMs: Long) {
    finish(nowMs)
    before.addLast(pcm)
    while (before.size > padFrames) {
      before.removeFirst()
    }
  }

  private fun finish(nowMs: Long) {
    val frames = current ?: return
    current = null
    if (frames.size >= shortestFrames) {
      deliver(Segment(join(frames), startedAt, nowMs))
    }
  }

  private fun join(frames: List<ShortArray>): ShortArray {
    val all = ShortArray(frames.sumOf { it.size })
    var at = 0
    for (frame in frames) {
      frame.copyInto(all, at)
      at += frame.size
    }
    return all
  }

  companion object {
    const val FRAME_SAMPLES = 512
    const val FRAME_MS = 32L
  }
}
