package expo.modules.healthconnect.listening

fun interface Voice {
  fun isVoice(frame: ShortArray): Boolean
}

class VoiceGate(
  private val voice: Voice,
  private val counters: ListeningCounters,
  private val restart: () -> Unit,
  private val feed: (ShortArray) -> Unit,
  prerollMs: Int = PREROLL_MS,
  private val hangoverFrames: Int = HANGOVER_FRAMES,
  private val opened: (Int) -> Unit = {}
) {
  private val preroll = WakePreroll(prerollMs)
  private val reach = prerollMs * WakePreroll.SAMPLES_PER_MS
  private val frame = ShortArray(FRAME_SAMPLES)
  private var filled = 0
  private var open = false
  private var quiet = 0
  private var skipped = 0
  private var started = false

  fun hear(pcm: ShortArray) {
    if (open) {
      forward(pcm)
    } else {
      preroll.push(pcm)
      skipped += pcm.size
    }
    var index = 0
    while (index < pcm.size) {
      val count = minOf(pcm.size - index, frame.size - filled)
      pcm.copyInto(frame, filled, index, index + count)
      filled += count
      index += count
      if (filled == frame.size) {
        filled = 0
        decide(voice.isVoice(frame))
      }
    }
  }

  fun rest() {
    open = false
    quiet = 0
    filled = 0
    started = false
    preroll.clear()
  }

  private fun decide(voiced: Boolean) {
    when {
      voiced -> {
        quiet = 0
        if (!open) openGate()
      }
      open -> {
        quiet += 1
        open = quiet < hangoverFrames
      }
    }
  }

  private fun openGate() {
    counters.voiceOpened()
    if (!started || skipped > reach) {
      restart()
    }
    started = true
    open = true
    skipped = 0
    val opening = preroll.take()
    opened(opening.size)
    forward(opening)
  }

  private fun forward(pcm: ShortArray) {
    counters.spotterRan(pcm.size)
    feed(pcm)
  }

  companion object {
    const val FRAME_SAMPLES = 512
    const val PREROLL_MS = 640
    const val HANGOVER_FRAMES = 19
  }
}
