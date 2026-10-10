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

data class GateSettings(
  val echoTailMs: Long = 300,
  val sustainMs: Int = 256,
  val bargeInLevel: Double = 0.04,
  val ignoreAssistantAudible: Boolean = false,
  val aggressiveWhileAudible: Boolean = true,
  val interruptible: Boolean = true,
  val speechThreshold: Double = LIBRARY_STANDARD_THRESHOLD,
  val minSpeechMs: Int = 64,
  val pauseMs: Int = 200
) {
  companion object {
    const val LIBRARY_STANDARD_THRESHOLD = 0.3
  }
}

class SpeechGate(
  context: Context,
  private val sink: SpeechGateSink,
  private val assistantAudible: () -> Boolean,
  initial: GateSettings = GateSettings()
) : AutoCloseable {
  private var settings = initial
  private val vad = VadSilero(
    context,
    sampleRate = SampleRate.SAMPLE_RATE_16K,
    frameSize = FrameSize.FRAME_SIZE_512,
    mode = Mode.NORMAL,
    silenceDurationMs = initial.pauseMs,
    speechDurationMs = initial.minSpeechMs
  )
  private val frame = ShortArray(VAD_FRAME_SAMPLES)
  private val boosted = ShortArray(VAD_FRAME_SAMPLES)
  private val preroll = ArrayDeque<ByteArray>()
  private var filled = 0
  private var open = false
  private var speaking = false
  private var overEcho = false
  private var bargeMs = 0
  private var audibleAt = Long.MIN_VALUE / 2

  @Synchronized
  fun configure(next: GateSettings) {
    settings = next
    vad.speechDurationMs = next.minSpeechMs
    vad.silenceDurationMs = next.pauseMs
  }

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
  fun reset() {
    finishSpeech()
    preroll.clear()
  }

  @Synchronized
  override fun close() {
    finishSpeech()
    vad.close()
  }

  private fun step() {
    val now = SystemClock.elapsedRealtime()
    if (assistantAudible() && !settings.ignoreAssistantAudible) audibleAt = now
    val quiet = now - audibleAt > settings.echoTailMs
    vad.mode = modeOf(quiet)
    val speech = vad.isSpeech(heard())
    bargeMs = if (speech && !quiet && levelOf(frame) >= settings.bargeInLevel) bargeMs + VAD_FRAME_MS else 0
    if (!speech) {
      finishSpeech()
      return
    }
    if (!speaking) {
      speaking = true
      overEcho = !quiet
    }
    val clear = !overEcho && quiet
    if (!open && (clear || bargesIn())) openGate()
  }

  private fun bargesIn(): Boolean = settings.interruptible && bargeMs + settings.minSpeechMs >= settings.sustainMs

  private fun modeOf(quiet: Boolean): Mode {
    val base = if (settings.speechThreshold > GateSettings.LIBRARY_STANDARD_THRESHOLD) Mode.AGGRESSIVE else Mode.NORMAL
    return if (!quiet && settings.aggressiveWhileAudible) Mode.AGGRESSIVE else base
  }

  private fun heard(): ShortArray {
    if (settings.speechThreshold >= GateSettings.LIBRARY_STANDARD_THRESHOLD) return frame
    for (index in frame.indices) {
      boosted[index] = (frame[index] * SENSITIVE_GAIN).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
    }
    return boosted
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
    const val SENSITIVE_GAIN = 2
    const val PREROLL_PACKETS = 32
    const val FULL_SCALE = 32_768.0
  }
}
