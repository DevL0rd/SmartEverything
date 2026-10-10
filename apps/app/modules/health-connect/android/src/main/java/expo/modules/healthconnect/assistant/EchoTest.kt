package expo.modules.healthconnect.assistant

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import expo.modules.healthconnect.voice.SpeechGate
import expo.modules.healthconnect.voice.SpeechGateSink
import expo.modules.healthconnect.voice.VoiceCapture
import expo.modules.healthconnect.voice.VoiceCaptureUnavailable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.math.PI
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt
import org.json.JSONObject

class EchoMeasurement(
  val noiseFloor: Double,
  val played: Double,
  val gateOpenedWhileQuiet: Boolean,
  val gateOpenedWhilePlaying: Boolean,
  val frames: Int
)

object EchoVerdict {
  const val NONE = "none"
  const val SOME = "some"
  const val STRONG = "strong"
  const val FAILED = "failed"
  private const val NOISY_FLOOR = 0.03
  private const val SOME_DB = 6.0
  private const val STRONG_DB = 15.0
  private const val MIN_FRAMES = 25

  fun decibels(level: Double): Double = 20 * log10(max(level, SILENCE))

  fun of(measurement: EchoMeasurement): String {
    if (measurement.frames < MIN_FRAMES || measurement.noiseFloor > NOISY_FLOOR || measurement.gateOpenedWhileQuiet) return FAILED
    val rise = decibels(measurement.played) - decibels(measurement.noiseFloor)
    return when {
      rise >= STRONG_DB || (measurement.gateOpenedWhilePlaying && rise >= SOME_DB) -> STRONG
      rise >= SOME_DB || measurement.gateOpenedWhilePlaying -> SOME
      else -> NONE
    }
  }

  private const val SILENCE = 1e-6
}

class EchoTest(private val context: Context, private val devices: CallDevices, private val settings: CallAudioSettings) {
  private enum class Phase { WAITING, QUIET, PLAYING, DONE }

  @Volatile
  private var phase = Phase.WAITING
  private val quietLevels = mutableListOf<Double>()
  private val playedLevels = mutableListOf<Double>()
  private val quietOpens = AtomicInteger()
  private val playingOpens = AtomicInteger()
  private var skipped = 0

  fun run(): JSONObject {
    CallAudioMode.enter(context)
    try {
      CallAudioMode.route(context, devices, settings.input, settings.output)
      val measurement = measure()
      return report(EchoVerdict.of(measurement), measurement)
    } catch (failure: VoiceCaptureUnavailable) {
      return JSONObject().put("outcome", EchoVerdict.FAILED).put("detail", failure.message.orEmpty())
    } finally {
      CallAudioMode.leave(context)
    }
  }

  private fun measure(): EchoMeasurement {
    val gate = SpeechGate(context, countingSink(), { false }, settings.gate().copy(ignoreAssistantAudible = true))
    val listening = VoiceCapture.addConsumer { pcm -> hear(pcm, gate) }
    try {
      phase = Phase.QUIET
      Thread.sleep(QUIET_MS)
      phase = Phase.PLAYING
      play()
      Thread.sleep(TAIL_MS)
      phase = Phase.DONE
    } finally {
      listening.close()
      gate.close()
    }
    return synchronized(this) {
      EchoMeasurement(
        noiseFloor = median(quietLevels),
        played = playedLevels.average().takeUnless { it.isNaN() } ?: 0.0,
        gateOpenedWhileQuiet = quietOpens.get() > 0,
        gateOpenedWhilePlaying = playingOpens.get() > 0,
        frames = quietLevels.size + playedLevels.size
      )
    }
  }

  private fun hear(pcm: ShortArray, gate: SpeechGate) {
    gate.hear(pcm)
    val level = levelOf(pcm)
    synchronized(this) {
      when (phase) {
        Phase.QUIET -> quietLevels.add(level)
        Phase.PLAYING -> if (skipped++ >= LATENCY_FRAMES) playedLevels.add(level)
        else -> Unit
      }
    }
  }

  private fun countingSink() = object : SpeechGateSink {
    override fun start() {
      when (phase) {
        Phase.QUIET -> quietOpens.incrementAndGet()
        Phase.PLAYING -> playingOpens.incrementAndGet()
        else -> Unit
      }
    }

    override fun packet(packet: ByteArray) = Unit

    override fun end() = Unit
  }

  private fun play() {
    val samples = chirp()
    val track = AudioTrack.Builder()
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
      .setAudioFormat(
        AudioFormat.Builder()
          .setSampleRate(VoiceCapture.SAMPLE_RATE)
          .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
          .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
          .build()
      )
      .setBufferSizeInBytes(samples.size * 2)
      .setTransferMode(AudioTrack.MODE_STATIC)
      .build()
    val finished = CountDownLatch(1)
    try {
      track.write(samples, 0, samples.size)
      track.setNotificationMarkerPosition(samples.size - 1)
      track.setPlaybackPositionUpdateListener(object : AudioTrack.OnPlaybackPositionUpdateListener {
        override fun onMarkerReached(source: AudioTrack) = finished.countDown()

        override fun onPeriodicNotification(source: AudioTrack) = Unit
      })
      track.play()
      finished.await(CHIRP_MS + DRAIN_MS, TimeUnit.MILLISECONDS)
    } finally {
      track.release()
    }
  }

  private fun chirp(): ShortArray {
    val total = (VoiceCapture.SAMPLE_RATE * CHIRP_MS / MS_PER_SECOND).toInt()
    val samples = ShortArray(total)
    var angle = 0.0
    for (index in 0 until total) {
      val progress = index.toDouble() / total
      angle += 2 * PI * (LOW_HZ + (HIGH_HZ - LOW_HZ) * progress) / VoiceCapture.SAMPLE_RATE
      val syllable = 0.5 + 0.5 * sin(2 * PI * SYLLABLES_HZ * index / VoiceCapture.SAMPLE_RATE)
      val voiced = sin(angle) + HARMONIC * sin(2 * angle) + HARMONIC * HARMONIC * sin(3 * angle)
      samples[index] = (voiced * syllable * PEAK * settings.volume * Short.MAX_VALUE).toInt().toShort()
    }
    return samples
  }

  private fun levelOf(pcm: ShortArray): Double {
    var sum = 0.0
    for (sample in pcm) sum += (sample / FULL_SCALE) * (sample / FULL_SCALE)
    return sqrt(sum / pcm.size)
  }

  private fun median(levels: List<Double>): Double = if (levels.isEmpty()) 0.0 else levels.sorted()[levels.size / 2]

  private fun report(outcome: String, measurement: EchoMeasurement): JSONObject = JSONObject()
    .put("outcome", outcome)
    .put("noiseFloorDb", EchoVerdict.decibels(measurement.noiseFloor))
    .put("playedDb", EchoVerdict.decibels(measurement.played))
    .put("gateOpenedWhilePlaying", measurement.gateOpenedWhilePlaying)
    .put("gateOpenedWhileQuiet", measurement.gateOpenedWhileQuiet)
    .put("frames", measurement.frames)
    .put("mode", context.getSystemService(AudioManager::class.java).mode)

  private companion object {
    const val QUIET_MS = 1_000L
    const val TAIL_MS = 300L
    const val CHIRP_MS = 2_000L
    const val DRAIN_MS = 1_000L
    const val MS_PER_SECOND = 1_000.0
    const val LATENCY_FRAMES = 10
    const val LOW_HZ = 300.0
    const val HIGH_HZ = 3_400.0
    const val SYLLABLES_HZ = 4.0
    const val HARMONIC = 0.5
    const val PEAK = 0.4
    const val FULL_SCALE = 32_768.0
  }
}
