package expo.modules.healthconnect.voice

import android.content.Context
import android.os.SystemClock
import expo.modules.healthconnect.diagnostics.NativeLog
import kotlin.math.sqrt

interface SpeechGateSink {
  fun start()
  fun packet(packet: ByteArray)
  fun end()
}

data class GateSettings(
  val echoTailMs: Long,
  val sustainMs: Int,
  val bargeInLevel: Double,
  val ignoreAssistantAudible: Boolean,
  val aggressiveWhileAudible: Boolean,
  val interruptible: Boolean,
  val speechThreshold: Double,
  val minSpeechMs: Int,
  val pauseMs: Int
)

class SpeechGate(
  context: Context,
  private val sink: SpeechGateSink,
  private val assistantAudible: () -> Boolean,
  initial: GateSettings,
  vads: SpeechVadFactory = ::SileroVad
) : AutoCloseable {
  private var settings = initial
  private val vad = vads(context, VadMode.NORMAL, initial.minSpeechMs, initial.pauseMs).also { NativeLog.info("speech-gate", "vad.created") }
  private val frame = ShortArray(VAD_FRAME_SAMPLES)
  private var firstFrame = true
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
    if (firstFrame) {
      firstFrame = false
      NativeLog.info("speech-gate", "vad.first_frame")
    }
    val speech = vad.isSpeech(heard())
    bargeMs = if (speech && levelOf(frame) >= settings.bargeInLevel) bargeMs + VAD_FRAME_MS else 0
    if (speech) onSpeech(quiet) else finishSpeech()
  }

  private fun onSpeech(quiet: Boolean) {
    if (!speaking) {
      speaking = true
      overEcho = !quiet
    }
    val clear = !overEcho && quiet
    if (!open && (clear || bargesIn())) openGate()
  }

  private fun bargesIn(): Boolean = settings.interruptible && bargeMs + settings.minSpeechMs >= settings.sustainMs

  private fun modeOf(quiet: Boolean): VadMode {
    val base = MODE_THRESHOLDS.firstOrNull { it.second >= settings.speechThreshold }?.first ?: VadMode.VERY_AGGRESSIVE
    return if (!quiet && settings.aggressiveWhileAudible) maxOf(base, VadMode.AGGRESSIVE) else base
  }

  private fun heard(): ShortArray {
    val gain = MODE_THRESHOLDS.first().second / settings.speechThreshold
    if (gain <= 1.0) return frame
    for (index in frame.indices) {
      boosted[index] = (frame[index] * gain).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
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
    val MODE_THRESHOLDS = listOf(VadMode.NORMAL to 0.5, VadMode.AGGRESSIVE to 0.8, VadMode.VERY_AGGRESSIVE to 0.95)
    const val PREROLL_PACKETS = 32
    const val FULL_SCALE = 32_768.0
  }
}
