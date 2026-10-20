package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.BrushListener
import expo.modules.healthconnect.toothbrush.BrushText

class OralbBusy(private val windowMs: Long = WINDOW_MS) {
  private val seen = HashMap<String, Long>()

  @Synchronized
  fun running(address: String, at: Long) {
    seen[address.uppercase()] = at
  }

  @Synchronized
  fun recent(address: String, now: Long): Boolean {
    val at = seen[address.uppercase()] ?: return false
    return now - at <= windowMs
  }

  companion object {
    const val WINDOW_MS = 60_000L
  }
}

class OralbWatch(
  private val inner: BrushListener,
  private val address: String,
  private val busy: OralbBusy,
  private val marker: String,
  private val clock: () -> Long
) : BrushListener {
  private var attempting = false
  private var settled = false

  override fun phase(phase: String, detail: String?) {
    when (phase) {
      "connecting" -> {
        attempting = true
        settled = false
      }
      "linked" -> settled = true
    }
    val failed = phase == "asleep" && attempting && !settled && busy.recent(address, clock())
    if (failed) {
      attempting = false
      inner.phase("busy", BrushText.busy("oralb"))
    } else {
      inner.phase(phase, detail ?: marker)
    }
  }

  override fun notified(characteristic: String, value: ByteArray) {
    settled = true
    inner.notified(characteristic, value)
  }

  override fun ended() {
    inner.ended()
  }
}
