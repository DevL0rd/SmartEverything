package expo.modules.healthconnect.listening

import android.content.Context
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.KeywordSpotter
import com.k2fsa.sherpa.onnx.KeywordSpotterConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineStream
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig
import java.io.File

data class WakeHeard(val phrase: String, val snippetDbfs: Double, val preroll: ShortArray, val atMs: Long)

class WakeEar(
  model: File,
  keywordsFile: File,
  threshold: Float,
  context: Context,
  counters: ListeningCounters,
  private val onWake: (WakeHeard) -> Unit,
  private val clock: () -> Long = System::currentTimeMillis
) : AutoCloseable {
  private val spotter = KeywordSpotter(null, configOf(model, keywordsFile, threshold))
  private val streams = listOf(spotter.createStream(""), spotter.createStream(""))
  private val preroll = WakePreroll(WakePreroll.LOOKBACK_MS)
  private val silero = SileroVoice(context)
  private val gate = VoiceGate(silero.voice, counters, ::restart, ::feed, opened = preroll::sentenceBegan)
  private val samples = FloatArray(FRAME_16K)
  private var lagging = STAGGER_SAMPLES
  private var closed = false

  @Synchronized
  fun hear(pcm16k: ShortArray) {
    if (closed) {
      return
    }
    preroll.push(pcm16k)
    gate.hear(pcm16k)
  }

  private fun feed(pcm16k: ShortArray) {
    val floats = if (pcm16k.size == samples.size) samples else FloatArray(pcm16k.size)
    for (index in pcm16k.indices) {
      floats[index] = pcm16k[index] / LevelOf.FULL_SCALE.toFloat()
    }
    val skipped = minOf(lagging, floats.size)
    lagging -= skipped
    val (early, late) = streams
    early.acceptWaveform(floats, SAMPLE_RATE)
    if (skipped < floats.size) {
      late.acceptWaveform(if (skipped == 0) floats else floats.copyOfRange(skipped, floats.size), SAMPLE_RATE)
    }
    val heard = streams.mapNotNull { decode(it) }.firstOrNull() ?: return
    streams.forEach { spotter.reset(it) }
    announce(heard)
  }

  private fun restart() {
    lagging = STAGGER_SAMPLES
    streams.forEach { spotter.reset(it) }
  }

  @Synchronized
  fun rest() {
    preroll.clear()
    gate.rest()
  }

  @Synchronized
  override fun close() {
    if (!closed) {
      closed = true
      streams.forEach(OnlineStream::release)
      spotter.release()
      silero.close()
    }
  }

  private fun decode(stream: OnlineStream): String? {
    var heard: String? = null
    while (spotter.isReady(stream)) {
      spotter.decode(stream)
      val keyword = spotter.getResult(stream).keyword
      if (keyword.isNotEmpty()) {
        spotter.reset(stream)
        heard = heard ?: keyword.replace('_', ' ')
      }
    }
    return heard
  }

  private fun announce(phrase: String) {
    val snippet = preroll.level(SNIPPET_MS)
    onWake(WakeHeard(phrase, snippet, preroll.takeSentence(), clock()))
  }

  private companion object {
    const val SAMPLE_RATE = 16_000
    const val FRAME_16K = 320
    const val STAGGER_SAMPLES = 1280
    const val SNIPPET_MS = 1000
    const val FEATURE_DIM = 80
    const val BOOST = 2f
    const val ACTIVE_PATHS = 8
    const val TRAILING_BLANKS = 1
    const val THREADS = 1

    fun configOf(model: File, keywordsFile: File, threshold: Float) = KeywordSpotterConfig(
      featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = FEATURE_DIM),
      modelConfig = OnlineModelConfig(
        transducer = OnlineTransducerModelConfig(
          encoder = File(model, WakeModel.ENCODER).path,
          decoder = File(model, WakeModel.DECODER).path,
          joiner = File(model, WakeModel.JOINER).path
        ),
        tokens = File(model, WakeModel.TOKENS).path,
        numThreads = THREADS,
        debug = false
      ),
      maxActivePaths = ACTIVE_PATHS,
      keywordsFile = keywordsFile.path,
      keywordsScore = BOOST,
      keywordsThreshold = threshold,
      numTrailingBlanks = TRAILING_BLANKS
    )
  }
}
