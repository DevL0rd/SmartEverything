package expo.modules.healthconnect.voice

import android.content.Context
import com.k2fsa.sherpa.onnx.SileroVadModelConfig
import com.k2fsa.sherpa.onnx.Vad
import com.k2fsa.sherpa.onnx.VadModelConfig

enum class VadMode(val threshold: Float) {
  NORMAL(0.5f),
  AGGRESSIVE(0.8f),
  VERY_AGGRESSIVE(0.95f)
}

interface SpeechVad : AutoCloseable {
  var mode: VadMode
  var silenceDurationMs: Int
  var speechDurationMs: Int

  fun isSpeech(frame: ShortArray): Boolean
}

typealias SpeechVadFactory = (Context, VadMode, Int, Int) -> SpeechVad

class SpeechHysteresis(var speechMs: Int, var silenceMs: Int) {
  private var voicedMs = 0
  private var quietMs = 0
  private var speaking = false

  fun update(voiced: Boolean): Boolean {
    if (voiced) {
      voicedMs += FRAME_MS
      quietMs = 0
      if (!speaking && voicedMs >= speechMs) speaking = true
    } else {
      quietMs += FRAME_MS
      voicedMs = 0
      if (speaking && quietMs >= silenceMs) speaking = false
    }
    return speaking
  }

  companion object {
    const val FRAME_MS = 32
  }
}

interface VoiceProbability : AutoCloseable {
  fun probability(frame: ShortArray): Float

  fun reset()
}

class SileroModel(context: Context) : VoiceProbability {
  private val vad = Vad(
    context.assets,
    VadModelConfig(
      sileroVadModelConfig = SileroVadModelConfig(model = MODEL, windowSize = WINDOW),
      sampleRate = SAMPLE_RATE,
      numThreads = 1
    )
  )
  private val samples = FloatArray(WINDOW)

  override fun probability(frame: ShortArray): Float {
    for (index in samples.indices) samples[index] = frame[index] / FULL_SCALE
    return vad.compute(samples)
  }

  override fun reset() = vad.reset()

  override fun close() = vad.release()

  companion object {
    const val WINDOW = 512
    private const val MODEL = "silero_vad.onnx"
    private const val SAMPLE_RATE = 16_000
    private const val FULL_SCALE = 32_768f
  }
}

class SileroVad(
  context: Context,
  override var mode: VadMode,
  speechMs: Int,
  silenceMs: Int
) : SpeechVad {
  private val model = SileroModel(context)
  private val hysteresis = SpeechHysteresis(speechMs, silenceMs)

  override var speechDurationMs: Int
    get() = hysteresis.speechMs
    set(value) {
      hysteresis.speechMs = value
    }

  override var silenceDurationMs: Int
    get() = hysteresis.silenceMs
    set(value) {
      hysteresis.silenceMs = value
    }

  override fun isSpeech(frame: ShortArray): Boolean = hysteresis.update(model.probability(frame) >= mode.threshold)

  override fun close() = model.close()
}
