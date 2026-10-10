package expo.modules.healthconnect.voice

import android.annotation.SuppressLint
import android.media.AudioDeviceInfo
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

  private class Effects(val echo: AudioEffect?, val noise: AudioEffect?, val gain: AudioEffect?) {
    fun all(): List<AudioEffect> = listOfNotNull(echo, noise, gain)

    fun tune(noiseSuppression: Boolean, autoGain: Boolean) {
      noise?.enabled = noiseSuppression
      gain?.enabled = autoGain
    }
  }

  private val consumers = CopyOnWriteArraySet<(ShortArray) -> Unit>()
  private var thread: Thread? = null
  private var recorder: AudioRecord? = null
  private var effects: Effects? = null
  private var noiseSuppression = true
  private var autoGain = true
  private var preferredInput: AudioDeviceInfo? = null

  @Volatile
  private var running = false

  @Synchronized
  fun configure(noiseSuppression: Boolean, autoGain: Boolean) {
    this.noiseSuppression = noiseSuppression
    this.autoGain = autoGain
    effects?.tune(noiseSuppression, autoGain)
  }

  @Synchronized
  fun preferInput(device: AudioDeviceInfo?) {
    preferredInput = device
    recorder?.preferredDevice = device
  }

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
      recorder = null
      effects = null
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
    record.preferredDevice = preferredInput
    val attached = attachEffects(record.audioSessionId)
    recorder = record
    effects = attached
    running = true
    thread = Thread({ loop(record, attached) }, "smarteverything-voice-capture").apply { start() }
  }

  private fun attachEffects(session: Int): Effects = Effects(
    effect("echo canceller", AcousticEchoCanceler.isAvailable(), true) { AcousticEchoCanceler.create(session) },
    effect("noise suppressor", NoiseSuppressor.isAvailable(), noiseSuppression) { NoiseSuppressor.create(session) },
    effect("gain control", AutomaticGainControl.isAvailable(), autoGain) { AutomaticGainControl.create(session) }
  )

  private fun effect(name: String, available: Boolean, enabled: Boolean, create: () -> AudioEffect?): AudioEffect? {
    if (!available) {
      return null
    }
    return try {
      create()?.also { it.enabled = enabled }
    } catch (failure: RuntimeException) {
      Log.w(TAG, "voice capture: the $name could not be attached: ${failure.message}")
      null
    }
  }

  private fun loop(record: AudioRecord, effects: Effects) {
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
      effects.all().forEach { it.release() }
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
