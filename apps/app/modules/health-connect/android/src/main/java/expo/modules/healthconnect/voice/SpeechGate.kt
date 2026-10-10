package expo.modules.healthconnect.voice

import android.content.Context
import android.os.SystemClock
import com.konovalov.vad.silero.VadSilero
import com.konovalov.vad.silero.config.FrameSize
import com.konovalov.vad.silero.config.Mode
import com.konovalov.vad.silero.config.SampleRate
import kotlin.math.sqrt

interface SpeechGateSink {
  fun start()
  fun packet(packet: ByteArray)
  fun end()
}

class SpeechGate(
  context: Context,
  private val sink: SpeechGateSink,
  private val assistantAudible: () -> Boolean
) : AutoCloseable {
  private val vad = VadSilero(
    context,
    sampleRate = SampleRate.SAMPLE_RATE_16K,
    frameSize = FrameSize.FRAME_SIZE_512,
    mode = Mode.NORMAL,
    silenceDurationMs = SILENCE_MS,
    speechDurationMs = SPEECH_MS
  )
  private val frame = ShortArray(VAD_FRAME_SAMPLES)
  private val preroll = ArrayDeque<ByteArray>()
  private var filled = 0
  private var open = false
  private var speaking = false
  private var overEcho = false
  private var bargeMs = 0
  private var audibleAt = Long.MIN_VALUE / 2

  @Synchronized
  fun hear(pcm: ShortArray) {
    var index = 0
    while (index + DOWNSAMPLE <= pcm.size) {
      frame[filled] = ((pcm[index] + pcm[index + 1] + pcm[index + 2]) / DOWNSAMPLE).toShort()
      filled += 1
      index += DOWNSAMPLE
      if (filled == VAD_FRAME_SAMPLES) {
        filled = 0
        step()
      }
    }
  }

  @Synchronized
  fun packet(packet: ByteArray) {
    if (open) {
      sink.packet(packet)
      return
    }
    preroll.addLast(packet)
    while (preroll.size > PREROLL_PACKETS) preroll.removeFirst()
  }

  @Synchronized
  override fun close() {
    finishSpeech()
    vad.close()
  }

  private fun step() {
    val now = SystemClock.elapsedRealtime()
    if (assistantAudible()) audibleAt = now
    val quiet = now - audibleAt > ECHO_TAIL_MS
    vad.mode = if (quiet) Mode.NORMAL else Mode.AGGRESSIVE
    val speech = vad.isSpeech(frame)
    bargeMs = if (speech && !quiet && levelOf(frame) >= BARGE_IN_LEVEL) bargeMs + VAD_FRAME_MS else 0
    if (!speech) {
      finishSpeech()
      return
    }
    if (!speaking) {
      speaking = true
      overEcho = !quiet
    }
    val clear = !overEcho && quiet
    if (!open && (clear || bargeMs + SPEECH_MS >= BARGE_IN_SUSTAIN_MS)) openGate()
  }

  private fun openGate() {
    open = true
    sink.start()
    while (preroll.isNotEmpty()) sink.packet(preroll.removeFirst())
  }

  private fun finishSpeech() {
    speaking = false
    overEcho = false
    bargeMs = 0
    if (open) {
      open = false
      sink.end()
    }
  }

  private fun levelOf(samples: ShortArray): Double {
    var sum = 0.0
    for (sample in samples) sum += (sample / FULL_SCALE) * (sample / FULL_SCALE)
    return sqrt(sum / samples.size)
  }

  private companion object {
    const val DOWNSAMPLE = VoiceCapture.SAMPLE_RATE / 16_000
    const val VAD_FRAME_SAMPLES = 512
    const val VAD_FRAME_MS = 32
    const val SPEECH_MS = 160
    const val SILENCE_MS = 640
    const val ECHO_TAIL_MS = 300
    const val BARGE_IN_SUSTAIN_MS = 256
    const val BARGE_IN_LEVEL = 0.04
    const val PREROLL_PACKETS = 32
    const val FULL_SCALE = 32_768.0
  }
}
