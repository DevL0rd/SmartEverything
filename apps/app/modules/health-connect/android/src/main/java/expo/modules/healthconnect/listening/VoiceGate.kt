package expo.modules.healthconnect.listening

import expo.modules.healthconnect.voice.VadMode

class VoiceGate(
  private val counters: ListeningCounters,
  private val restart: () -> Unit,
  private val feed: (ShortArray) -> Unit,
  prerollMs: Int = PREROLL_MS,
  private val hangoverFrames: Int = HANGOVER_FRAMES,
  private val opened: (Int) -> Unit = {}
) {
  private val preroll = WakePreroll(prerollMs)
  private val reach = prerollMs * WakePreroll.SAMPLES_PER_MS
  private var open = false
  private var quiet = 0
  private var skipped = 0
  private var started = false

  fun hear(pcm: ShortArray, frames: List<VoiceFrame>) {
    if (open) {
      forward(pcm)
    } else {
      preroll.push(pcm)
      skipped += pcm.size
    }
    frames.forEach { decide(it.voiced(MODE)) }
  }

  fun rest() {
    open = false
    quiet = 0
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
    val MODE = VadMode.NORMAL
    const val PREROLL_MS = 640
    const val HANGOVER_FRAMES = 19
  }
}
