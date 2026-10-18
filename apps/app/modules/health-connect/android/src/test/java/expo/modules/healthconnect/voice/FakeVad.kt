package expo.modules.healthconnect.voice

import android.content.Context

class FakeVad(
  @Suppress("UNUSED_PARAMETER") context: Context,
  override var mode: VadMode,
  override var speechDurationMs: Int,
  override var silenceDurationMs: Int
) : SpeechVad {
  init {
    lastSilenceMs = silenceDurationMs
  }

  override fun isSpeech(frame: ShortArray): Boolean {
    lastMode = mode
    lastFrame = frame.copyOf()
    return heardSpeech
  }

  override fun close() {
    closed = true
  }

  companion object {
    var heardSpeech = false
    var closed = false
    var lastSilenceMs: Int = -1
    var lastMode: VadMode? = null
    var lastFrame: ShortArray = ShortArray(0)
  }
}
