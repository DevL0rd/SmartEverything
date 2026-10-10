package expo.modules.healthconnect.voice

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AudioEffect
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.util.Log
import java.util.concurrent.CopyOnWriteArraySet

object VoiceCapture {
  const val SAMPLE_RATE = 48_000
  const val FRAME_SAMPLES = 960

  private val consumers = CopyOnWriteArraySet<(ShortArray) -> Unit>()
  private var thread: Thread? = null

  @Volatile
  private var running = false

  @Synchronized
  fun addConsumer(consumer: (ShortArray) -> Unit): AutoCloseable {
    if (thread == null) {
      start()
    }
    consumers.add(consumer)
    return AutoCloseable { remove(consumer) }
  }

  @Synchronized
  private fun remove(consumer: (ShortArray) -> Unit) {
    consumers.remove(consumer)
    if (consumers.isEmpty()) {
      running = false
      thread = null
    }
  }

  @SuppressLint("MissingPermission")
  private fun start() {
    val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL, ENCODING)
    if (minimum <= 0) {
      throw VoiceCaptureUnavailable("48 kHz mono capture is not supported ($minimum)")
    }
    val record = AudioRecord(
      MediaRecorder.AudioSource.VOICE_COMMUNICATION,
      SAMPLE_RATE,
      CHANNEL,
      ENCODING,
      maxOf(minimum, FRAME_SAMPLES * 2 * 4)
    )
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      throw VoiceCaptureUnavailable("Android refused the recorder; is the microphone permission granted?")
    }
    val effects = attachEffects(record.audioSessionId)
    running = true
    thread = Thread({ loop(record, effects) }, "smarteverything-voice-capture").apply { start() }
  }

  private fun attachEffects(session: Int): List<AudioEffect> = listOfNotNull(
    effect("echo canceller", AcousticEchoCanceler.isAvailable()) { AcousticEchoCanceler.create(session) },
    effect("noise suppressor", NoiseSuppressor.isAvailable()) { NoiseSuppressor.create(session) },
    effect("gain control", AutomaticGainControl.isAvailable()) { AutomaticGainControl.create(session) }
  )

  private fun effect(name: String, available: Boolean, create: () -> AudioEffect?): AudioEffect? {
    if (!available) {
      return null
    }
    return try {
      create()?.also { it.enabled = true }
    } catch (failure: RuntimeException) {
      Log.w(TAG, "voice capture: the $name could not be attached: ${failure.message}")
      null
    }
  }

  private fun loop(record: AudioRecord, effects: List<AudioEffect>) {
    try {
      record.startRecording()
      val frame = ShortArray(FRAME_SAMPLES)
      while (running) {
        if (fill(record, frame)) {
          val copy = frame.copyOf()
          consumers.forEach { it(copy) }
        }
      }
    } finally {
      effects.forEach { it.release() }
      record.stop()
      record.release()
    }
  }

  private fun fill(record: AudioRecord, frame: ShortArray): Boolean {
    var read = 0
    while (read < FRAME_SAMPLES && running) {
      val count = record.read(frame, read, FRAME_SAMPLES - read)
      if (count <= 0) {
        return false
      }
      read += count
    }
    return read == FRAME_SAMPLES
  }

  private const val TAG = "SmartEverythingVoice"
  private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
  private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
}
