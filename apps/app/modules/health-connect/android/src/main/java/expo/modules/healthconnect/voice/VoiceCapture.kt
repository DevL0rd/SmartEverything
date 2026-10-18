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
  const val EAR_SAMPLE_RATE = 16_000
  const val EAR_FRAME_SAMPLES = 320

  enum class Mode(val source: Int, val sampleRate: Int, val frameSamples: Int) {
    Call(MediaRecorder.AudioSource.VOICE_COMMUNICATION, SAMPLE_RATE, FRAME_SAMPLES),
    Ear(MediaRecorder.AudioSource.VOICE_RECOGNITION, EAR_SAMPLE_RATE, EAR_FRAME_SAMPLES)
  }

  private class Effects(val echo: AudioEffect?, val noise: AudioEffect?, val gain: AudioEffect?) {
    fun all(): List<AudioEffect> = listOfNotNull(echo, noise, gain)

    fun tune(noiseSuppression: Boolean, autoGain: Boolean) {
      noise?.enabled = noiseSuppression
      gain?.enabled = autoGain
    }
  }

  private class Session(val record: AudioRecord, val effects: Effects, val mode: Mode) {
    @Volatile
    var active = true
  }

  private val calls = CopyOnWriteArraySet<(ShortArray) -> Unit>()
  private val ears = CopyOnWriteArraySet<(ShortArray) -> Unit>()
  private var session: Session? = null
  private var noiseSuppression = true
  private var autoGain = true
  private var preferredInput: AudioDeviceInfo? = null

  @Synchronized
  fun configure(noiseSuppression: Boolean, autoGain: Boolean) {
    this.noiseSuppression = noiseSuppression
    this.autoGain = autoGain
    session?.effects?.tune(noiseSuppression, autoGain)
  }

  @Synchronized
  fun preferInput(device: AudioDeviceInfo?) {
    preferredInput = device
    session?.record?.preferredDevice = device
  }

  @Synchronized
  fun addConsumer(mode: Mode = Mode.Call, consumer: (ShortArray) -> Unit): AutoCloseable {
    align(mode == Mode.Call || calls.isNotEmpty())
    (if (mode == Mode.Call) calls else ears).add(consumer)
    return AutoCloseable { remove(consumer) }
  }

  @Synchronized
  private fun remove(consumer: (ShortArray) -> Unit) {
    calls.remove(consumer)
    ears.remove(consumer)
    if (calls.isEmpty() && ears.isEmpty()) {
      session?.active = false
      session = null
    } else {
      align(calls.isNotEmpty())
    }
  }

  private fun align(call: Boolean) {
    val wanted = if (call) Mode.Call else Mode.Ear
    val current = session
    if (current?.mode == wanted) {
      return
    }
    session = open(wanted)
    current?.active = false
  }

  @SuppressLint("MissingPermission")
  private fun open(mode: Mode): Session {
    val minimum = AudioRecord.getMinBufferSize(mode.sampleRate, CHANNEL, ENCODING)
    if (minimum <= 0) {
      throw VoiceCaptureUnavailable("${mode.sampleRate} Hz mono capture is not supported ($minimum)")
    }
    val record = AudioRecord(
      mode.source,
      mode.sampleRate,
      CHANNEL,
      ENCODING,
      maxOf(minimum, mode.frameSamples * 2 * BUFFERED_FRAMES)
    )
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      throw VoiceCaptureUnavailable("Android refused the recorder; is the microphone permission granted?")
    }
    record.preferredDevice = preferredInput
    val effects = if (mode == Mode.Call) attachEffects(record.audioSessionId) else Effects(null, null, null)
    val opened = Session(record, effects, mode)
    Thread({ loop(opened) }, "smarteverything-voice-capture-${mode.name.lowercase()}").start()
    return opened
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

  private fun loop(opened: Session) {
    try {
      opened.record.startRecording()
      val frame = ShortArray(opened.mode.frameSamples)
      val narrow = Downsample()
      while (opened.active) {
        if (fill(opened, frame)) {
          deliver(opened.mode, frame.copyOf(), narrow)
        }
      }
    } finally {
      opened.effects.all().forEach { it.release() }
      opened.record.stop()
      opened.record.release()
    }
  }

  private fun deliver(mode: Mode, frame: ShortArray, narrow: Downsample) {
    if (mode == Mode.Ear) {
      ears.forEach { it(frame) }
      return
    }
    calls.forEach { it(frame) }
    if (ears.isNotEmpty()) {
      val heard = narrow.to16k(frame)
      ears.forEach { it(heard) }
    }
  }

  private fun fill(opened: Session, frame: ShortArray): Boolean {
    var read = 0
    while (read < frame.size && opened.active) {
      val count = opened.record.read(frame, read, frame.size - read)
      if (count <= 0) {
        return false
      }
      read += count
    }
    return read == frame.size
  }

  private const val TAG = "SmartEverythingVoice"
  private const val BUFFERED_FRAMES = 4
  private const val CHANNEL = AudioFormat.CHANNEL_IN_MONO
  private const val ENCODING = AudioFormat.ENCODING_PCM_16BIT
}
