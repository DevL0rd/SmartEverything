package expo.modules.healthconnect.planner

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.net.Uri
import android.os.Handler
import android.os.PowerManager
import expo.modules.healthconnect.diagnostics.NativeLog
import java.io.IOException

interface SleepPlayer {
  fun start()

  fun volume(level: Float)

  fun stop()
}

object SleepAudio {
  val ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
    .build()
}

class NoisePlayer(colour: NoiseColour) : SleepPlayer {
  private val generator = NoiseGenerator(colour)
  private var track: AudioTrack? = null
  private var thread: Thread? = null

  @Volatile private var running = false

  override fun start() {
    val format = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(RATE)
      .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .build()
    val minimum = AudioTrack.getMinBufferSize(RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val created = AudioTrack.Builder()
      .setAudioAttributes(SleepAudio.ATTRIBUTES)
      .setAudioFormat(format)
      .setBufferSizeInBytes(maxOf(minimum, CHUNK * BYTES_PER_SAMPLE))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .build()
    track = created
    running = true
    created.play()
    thread = Thread({ pump(created) }, "planner-sleep-noise").also { it.start() }
  }

  override fun volume(level: Float) {
    track?.setVolume(level)
  }

  override fun stop() {
    running = false
    track?.stop()
    thread?.join(JOIN_MILLIS)
    track?.release()
    track = null
    thread = null
  }

  private fun pump(target: AudioTrack) {
    val chunk = ShortArray(CHUNK)
    while (running) {
      generator.fill(chunk)
      target.write(chunk, 0, chunk.size)
    }
  }

  private companion object {
    const val RATE = 22_050
    const val CHUNK = 4_096
    const val BYTES_PER_SAMPLE = 2
    const val JOIN_MILLIS = 1_000L
  }
}

sealed class SleepTrack {
  class Local(val path: String) : SleepTrack()

  class Stream(val url: String) : SleepTrack()
}

class MediaSleepPlayer(
  private val context: Context,
  private val handler: Handler,
  tracks: List<SleepTrack>,
  shuffle: Boolean,
  private val failed: (String) -> Unit
) : SleepPlayer {
  private val queue = SleepQueue(tracks, shuffle)
  private val single = tracks.size == 1
  private var player: MediaPlayer? = null
  private var level = 1f
  private var deadline: Runnable? = null

  override fun start() {
    advance()
  }

  override fun volume(level: Float) {
    this.level = level
    player?.setVolume(level, level)
  }

  override fun stop() {
    deadline?.let(handler::removeCallbacks)
    deadline = null
    player?.release()
    player = null
  }

  private fun advance() {
    stop()
    val track = queue.next()
    val created = MediaPlayer()
    player = created
    try {
      created.setAudioAttributes(SleepAudio.ATTRIBUTES)
      created.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
      created.setVolume(level, level)
      created.setOnErrorListener { source, what, extra -> fail(source, "error $what/$extra") }
      load(created, track)
    } catch (failure: IOException) {
      NativeLog.warn(SCOPE, "media.failed", failure)
      fail(created, failure.message.orEmpty())
    } catch (failure: IllegalStateException) {
      NativeLog.warn(SCOPE, "media.failed", failure)
      fail(created, failure.message.orEmpty())
    }
  }

  private fun load(created: MediaPlayer, track: SleepTrack) {
    when (track) {
      is SleepTrack.Local -> {
        created.isLooping = single
        created.setOnCompletionListener { advance() }
        created.setDataSource(context, Uri.fromFile(java.io.File(track.path)))
        created.prepare()
        created.start()
      }
      is SleepTrack.Stream -> {
        created.setOnPreparedListener {
          deadline?.let(handler::removeCallbacks)
          it.start()
        }
        created.setDataSource(track.url)
        created.prepareAsync()
        val expire = Runnable { fail(created, "the station did not start in ${STREAM_DEADLINE_MILLIS / MILLIS} seconds") }
        deadline = expire
        handler.postDelayed(expire, STREAM_DEADLINE_MILLIS)
      }
    }
  }

  private fun fail(source: MediaPlayer, reason: String): Boolean {
    if (player === source) {
      stop()
      failed(reason)
    }
    return true
  }

  private companion object {
    const val SCOPE = "planner-sleep"
    const val MILLIS = 1_000L
    const val STREAM_DEADLINE_MILLIS = 15_000L
  }
}
