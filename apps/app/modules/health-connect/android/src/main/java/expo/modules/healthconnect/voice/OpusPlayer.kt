package expo.modules.healthconnect.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaFormat
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

class OpusPlayer(context: Context) {
  private val audio = context.getSystemService(AudioManager::class.java)
  private val worker = Executors.newSingleThreadExecutor { Thread(it, "smarteverything-voice-player") }
  private val attributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()
  private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
    .setAudioAttributes(attributes)
    .build()
  private var decoder: MediaCodec? = null
  private var track: AudioTrack? = null
  private var presentationUs = 0L
  private val info = MediaCodec.BufferInfo()

  @Volatile
  private var written = 0L

  fun begin() = worker.execute {
    closeNow()
    audio.requestAudioFocus(focus)
    decoder = openDecoder()
    track = openTrack().apply { play() }
    presentationUs = 0L
    written = 0L
  }

  fun audible(): Boolean {
    val playing = track ?: return false
    return written > playing.playbackHeadPosition.toLong()
  }

  fun push(packet: ByteArray) = worker.execute {
    val codec = decoder ?: return@execute
    val index = codec.dequeueInputBuffer(INPUT_TIMEOUT_US)
    if (index >= 0) {
      codec.getInputBuffer(index)?.apply {
        clear()
        put(packet)
      }
      codec.queueInputBuffer(index, 0, packet.size, presentationUs, 0)
      presentationUs += FRAME_US
    }
    drain(codec)
  }

  fun end() = worker.execute { closeNow() }

  fun flush() = worker.execute {
    track?.pause()
    track?.flush()
    decoder?.flush()
    written = 0L
    track?.play()
  }

  fun release() {
    worker.execute { closeNow() }
    worker.shutdown()
  }

  private fun drain(codec: MediaCodec) {
    while (true) {
      val index = codec.dequeueOutputBuffer(info, 0)
      if (index < 0) {
        return
      }
      val buffer = codec.getOutputBuffer(index)
      if (buffer != null && info.size > 0) {
        val pcm = ByteArray(info.size)
        buffer.position(info.offset)
        buffer.get(pcm)
        track?.write(pcm, 0, pcm.size)
        written += pcm.size / 2
      }
      codec.releaseOutputBuffer(index, false)
    }
  }

  private fun closeNow() {
    track?.stop()
    track?.release()
    track = null
    decoder?.stop()
    decoder?.release()
    decoder = null
    audio.abandonAudioFocusRequest(focus)
  }

  private fun openTrack(): AudioTrack {
    val minimum = AudioTrack.getMinBufferSize(VoiceCapture.SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    return AudioTrack.Builder()
      .setAudioAttributes(attributes)
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(VoiceCapture.SAMPLE_RATE)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build()
      )
      .setBufferSizeInBytes(maxOf(minimum, VoiceCapture.FRAME_SAMPLES * 2 * 6))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
      .build()
  }

  private fun openDecoder(): MediaCodec {
    val codec = try {
      MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
    } catch (failure: IOException) {
      throw OpusUnavailable(failure.message ?: "no decoder")
    }
    val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, VoiceCapture.SAMPLE_RATE, 1)
    format.setByteBuffer("csd-0", opusHead())
    format.setByteBuffer("csd-1", nanos(PRE_SKIP_NS))
    format.setByteBuffer("csd-2", nanos(SEEK_PREROLL_NS))
    codec.configure(format, null, null, 0)
    codec.start()
    return codec
  }

  private companion object {
    const val FRAME_US = 20_000L
    const val INPUT_TIMEOUT_US = 10_000L
    const val PRE_SKIP = 312
    const val PRE_SKIP_NS = 6_500_000L
    const val SEEK_PREROLL_NS = 80_000_000L

    fun opusHead(): ByteBuffer {
      val head = ByteBuffer.allocate(19).order(ByteOrder.LITTLE_ENDIAN)
      head.put("OpusHead".toByteArray(Charsets.US_ASCII))
      head.put(1)
      head.put(1)
      head.putShort(PRE_SKIP.toShort())
      head.putInt(VoiceCapture.SAMPLE_RATE)
      head.putShort(0)
      head.put(0)
      head.flip()
      return head
    }

    fun nanos(value: Long): ByteBuffer =
      ByteBuffer.allocate(8).order(ByteOrder.nativeOrder()).putLong(value).apply { flip() }
  }
}
