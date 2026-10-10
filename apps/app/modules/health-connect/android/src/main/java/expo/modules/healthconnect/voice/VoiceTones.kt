package expo.modules.healthconnect.voice

import android.media.AudioManager
import android.media.ToneGenerator

object VoiceTones {
  private val generator by lazy { ToneGenerator(AudioManager.STREAM_MUSIC, VOLUME) }

  fun permit() = generator.startTone(ToneGenerator.TONE_PROP_BEEP, 80)

  fun busy() = generator.startTone(ToneGenerator.TONE_SUP_BUSY, 300)

  fun roger() = generator.startTone(ToneGenerator.TONE_PROP_ACK, 120)

  fun end() = generator.startTone(ToneGenerator.TONE_PROP_BEEP2, 120)

  private const val VOLUME = 60
}
