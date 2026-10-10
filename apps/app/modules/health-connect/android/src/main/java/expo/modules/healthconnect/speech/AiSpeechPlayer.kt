package expo.modules.healthconnect.speech

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.PowerManager
import android.util.Base64
import java.io.File

class AiSpeechPlayer(private val context: Context) {
  private val audio = context.getSystemService(AudioManager::class.java)
  private var player: MediaPlayer? = null
  private var file: File? = null
  private var focus: AudioFocusRequest? = null

  fun play(id: String, audioBase64: String, finished: () -> Unit, failed: (String) -> Unit) {
    try {
      start(id, audioBase64, finished, failed)
    } catch (failure: Exception) {
      release()
      failed("the speech could not be started: ${failure.javaClass.simpleName}: ${failure.message}")
    }
  }

  fun release() {
    player?.release()
    player = null
    file?.delete()
    file = null
    focus?.let { audio.abandonAudioFocusRequest(it) }
    focus = null
  }

  private fun start(id: String, audioBase64: String, finished: () -> Unit, failed: (String) -> Unit) {
    release()
    val target = File(context.cacheDir, "$FILE_PREFIX${id.filter { it.isLetterOrDigit() || it == '-' }}$FILE_SUFFIX")
    target.writeBytes(Base64.decode(audioBase64, Base64.DEFAULT))
    file = target
    val attributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANT)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()
    focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
      .setAudioAttributes(attributes)
      .build()
      .also { audio.requestAudioFocus(it) }
    val next = MediaPlayer()
    player = next
    next.setAudioAttributes(attributes)
    next.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
    next.setOnCompletionListener {
      release()
      finished()
    }
    next.setOnErrorListener { _, what, extra ->
      release()
      failed("the audio player stopped with error $what/$extra")
      true
    }
    next.setDataSource(target.path)
    next.setOnPreparedListener { it.start() }
    next.prepareAsync()
  }

  companion object {
    private const val FILE_PREFIX = "ai-speech-"
    private const val FILE_SUFFIX = ".ogg"

    fun clearStale(context: Context) {
      context.cacheDir.listFiles { file -> file.name.startsWith(FILE_PREFIX) && file.name.endsWith(FILE_SUFFIX) }
        ?.forEach { it.delete() }
    }
  }
}
