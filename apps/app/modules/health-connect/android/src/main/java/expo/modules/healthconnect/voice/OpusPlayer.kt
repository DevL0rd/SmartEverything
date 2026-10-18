package expo.modules.healthconnect.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

enum class PlayerProfile(val usage: Int, val focusGain: Int) {
  MEDIA(AudioAttributes.USAGE_MEDIA, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK),
  CALL(AudioAttributes.USAGE_VOICE_COMMUNICATION, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
}

class OpusPlayer(
  context: Context,
  profile: PlayerProfile = PlayerProfile.MEDIA,
  private val onLevel: ((Double) -> Unit)? = null
) {
  private val audio = context.getSystemService(AudioManager::class.java)
  private val thread = HandlerThread("smarteverything-voice-player").apply { start() }
  private val worker = Handler(thread.looper)
  private val attributes = AudioAttributes.Builder()
    .setUsage(profile.usage)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
    .build()
  private val focus = AudioFocusRequest.Builder(profile.focusGain)
    .setAudioAttributes(attributes)
    .build()
  private var decoder: MediaCodec? = null
  private var track: AudioTrack? = null
  private var input: DecoderInput? = null

  @Volatile
  private var written = 0L

  private var seenUnderruns = 0

  @Volatile
  private var volume = 1f

  @Volatile
  private var preferredOutput: AudioDeviceInfo? = null

  fun setVolume(level: Float) {
    volume = level
    enqueue { track?.setVolume(level) }
  }

  fun preferOutput(device: AudioDeviceInfo?) {
    preferredOutput = device
    enqueue { track?.preferredDevice = device }
  }

  fun begin() = enqueue {
    closeNow()
    audio.requestAudioFocus(focus)
    input = DecoderInput(::queueInput)
    decoder = openDecoder()
    track = openTrack().apply { play() }
    seenUnderruns = 0
    written = 0L
  }

  fun audible(): Boolean {
    val playing = track ?: return false
    return written > playing.playbackHeadPosition.toLong()
  }

  fun push(packet: ByteArray) = enqueue { input?.offer(packet) }

  fun end() = enqueue { closeNow() }

  fun flush() = enqueue {
    track?.pause()
    track?.flush()
    input?.reset()
    decoder?.apply {
      flush()
      start()
    }
    written = 0L
    onLevel?.invoke(0.0)
    track?.play()
  }

  fun release() {
    enqueue { closeNow() }
    thread.quitSafely()
  }

  private fun enqueue(task: () -> Unit) {
    worker.post(task)
  }

  private fun queueInput(index: Int, packet: ByteArray, presentationUs: Long) {
    val codec = decoder ?: return
    codec.getInputBuffer(index)?.apply {
      clear()
      put(packet)
    }
    codec.queueInputBuffer(index, 0, packet.size, presentationUs, 0)
  }

  private fun play(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) {
    if (codec !== decoder) return
    val buffer = codec.getOutputBuffer(index)
    if (buffer != null && info.size > 0) {
      val pcm = ByteArray(info.size)
      buffer.position(info.offset)
      buffer.get(pcm)
      track?.let { write(it, pcm) }
      written += pcm.size / 2
      onLevel?.invoke(PcmLevel.ofLittleEndian(pcm, pcm.size))
    }
    codec.releaseOutputBuffer(index, false)
  }

  private fun write(playing: AudioTrack, pcm: ByteArray) {
    playing.write(pcm, 0, pcm.size)
    val underruns = playing.underrunCount
    if (underruns > seenUnderruns) {
      seenUnderruns = underruns
      val grown = minOf(playing.bufferSizeInFrames * 2, playing.bufferCapacityInFrames)
      playing.bufferSizeInFrames = grown
      Log.w(TAG, "Playback underrun $underruns, buffer now ${grown * 1000 / VoiceCapture.SAMPLE_RATE} ms")
    }
  }

  private fun closeNow() {
    track?.stop()
    track?.release()
    track = null
    input = null
    decoder?.stop()
    decoder?.release()
    decoder = null
    onLevel?.invoke(0.0)
    audio.abandonAudioFocusRequest(focus)
  }

  private fun openTrack(): AudioTrack {
    val minimum = AudioTrack.getMinBufferSize(VoiceCapture.SAMPLE_RATE, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val opened = AudioTrack.Builder()
      .setAudioAttributes(attributes)
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(VoiceCapture.SAMPLE_RATE)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build()
      )
      .setBufferSizeInBytes(maxOf(minimum, CAPACITY_BYTES))
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
      .build()
    opened.bufferSizeInFrames = START_FRAMES
    opened.setVolume(volume)
    opened.preferredDevice = preferredOutput
    return opened
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
    codec.setCallback(feed, worker)
    codec.configure(format, null, null, 0)
    codec.start()
    return codec
  }

  private val feed = object : MediaCodec.Callback() {
    override fun onInputBufferAvailable(codec: MediaCodec, index: Int) {
      if (codec === decoder) input?.available(index)
    }

    override fun onOutputBufferAvailable(codec: MediaCodec, index: Int, info: MediaCodec.BufferInfo) = play(codec, index, info)

    override fun onError(codec: MediaCodec, error: MediaCodec.CodecException) {
      Log.e(TAG, "The Opus decoder failed: ${error.diagnosticInfo}")
      closeNow()
    }

    override fun onOutputFormatChanged(codec: MediaCodec, format: MediaFormat) = Unit
  }

  private companion object {
    const val TAG = "SmartEverythingVoice"
    const val CAPACITY_BYTES = VoiceCapture.SAMPLE_RATE * 2
    const val START_FRAMES = VoiceCapture.SAMPLE_RATE * 3 / 10
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
