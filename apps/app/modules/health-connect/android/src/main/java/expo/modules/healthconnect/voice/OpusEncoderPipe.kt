package expo.modules.healthconnect.voice

import android.media.MediaCodec
import android.media.MediaFormat
import android.os.Build
import java.io.IOException
import java.nio.ByteOrder

class OpusEncoderPipe(private val onPacket: (ByteArray) -> Unit) : AutoCloseable {
  private val codec = open()
  private val info = MediaCodec.BufferInfo()
  private var presentationUs = 0L
  private var closed = false

  @Synchronized
  fun feed(pcm: ShortArray) {
    if (closed) return
    val index = codec.dequeueInputBuffer(INPUT_TIMEOUT_US)
    if (index >= 0) {
      val buffer = codec.getInputBuffer(index)
      if (buffer != null) {
        buffer.clear()
        buffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer().put(pcm)
        codec.queueInputBuffer(index, 0, pcm.size * 2, presentationUs, 0)
        presentationUs += FRAME_US
      }
    }
    drain()
  }

  private fun drain() {
    while (true) {
      val index = codec.dequeueOutputBuffer(info, 0)
      if (index < 0) {
        return
      }
      val buffer = codec.getOutputBuffer(index)
      val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
      if (!config && info.size > 0 && buffer != null) {
        val packet = ByteArray(info.size)
        buffer.position(info.offset)
        buffer.get(packet)
        onPacket(packet)
      }
      codec.releaseOutputBuffer(index, false)
    }
  }

  @Synchronized
  override fun close() {
    if (closed) return
    closed = true
    codec.stop()
    codec.release()
  }

  private companion object {
    const val FRAME_US = 20_000L
    const val INPUT_TIMEOUT_US = 10_000L
    const val BITRATE = 24_000

    fun open(): MediaCodec {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        throw OpusUnavailable("talking needs Android 10 or newer")
      }
      val codec = try {
        MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_OPUS)
      } catch (failure: IOException) {
        throw OpusUnavailable(failure.message ?: "no encoder")
      }
      val format = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_OPUS, VoiceCapture.SAMPLE_RATE, 1)
      format.setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
      format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, VoiceCapture.FRAME_SAMPLES * 2)
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()
      return codec
    }
  }
}
