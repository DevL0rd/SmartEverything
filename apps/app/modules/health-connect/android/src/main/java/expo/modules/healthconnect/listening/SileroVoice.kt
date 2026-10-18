package expo.modules.healthconnect.listening

import android.content.Context
import expo.modules.healthconnect.voice.SileroVad
import expo.modules.healthconnect.voice.SpeechVadFactory
import expo.modules.healthconnect.voice.VadMode

class SileroVoice(context: Context, vads: SpeechVadFactory = ::SileroVad) : AutoCloseable {
  private val vad = vads(context, VadMode.NORMAL, 0, 0)

  val voice = Voice { frame -> vad.isSpeech(frame) }

  override fun close() = vad.close()
}
