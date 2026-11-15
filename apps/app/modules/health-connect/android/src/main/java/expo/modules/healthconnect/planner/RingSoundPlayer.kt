package expo.modules.healthconnect.planner

import android.content.Context
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Handler
import android.os.PowerManager
import expo.modules.healthconnect.diagnostics.NativeLog
import java.io.IOException

class RingSoundPlayer(
  private val context: Context,
  private val handler: Handler,
  private val cache: RingFileCache,
  private val report: (RingPlayback) -> Unit
) {
  private var player: MediaPlayer? = null
  private var deadline: Runnable? = null

  fun play(ring: PhoneRing) {
    stop()
    begin(ring, RingSoundPlan.of(ring.sound, cache::pathOf))
  }

  fun volume(level: Float) {
    player?.setVolume(level, level)
  }

  fun stop() {
    deadline?.let(handler::removeCallbacks)
    deadline = null
    player?.release()
    player = null
  }

  private fun begin(ring: PhoneRing, plan: SoundPlan) {
    if (plan.safetyNet != null) {
      NativeLog.warn(SCOPE, "sound.safety_net") { mapOf("reason" to plan.safetyNet) }
    }
    when (val source = plan.source) {
      is SoundSource.Stream -> stream(ring, source)
      is SoundSource.Local -> direct(ring, Uri.fromFile(java.io.File(source.path)), source.name, plan.safetyNet)
      is SoundSource.Tone -> direct(ring, toneUri(source.id), "the alarm tone", plan.safetyNet)
    }
  }

  private fun direct(ring: PhoneRing, uri: Uri?, name: String, safetyNet: String?) {
    val created = uri?.let { open(it, ring) }
    if (created == null) {
      giveUp(ring, safetyNet ?: "the sound could not be opened")
      return
    }
    player = created
    if (safetyNet == null) {
      created.setOnErrorListener { failed, what, extra -> onFailure(ring, failed, "error $what/$extra") }
    }
    created.start()
    report(RingPlayback(name, safetyNet))
  }

  private fun stream(ring: PhoneRing, source: SoundSource.Stream) {
    val created = MediaPlayer()
    player = created
    try {
      prepare(created)
      created.setOnErrorListener { failed, what, extra -> onFailure(ring, failed, "error $what/$extra") }
      created.setOnPreparedListener {
        if (player === it) {
          deadline?.let(handler::removeCallbacks)
          it.start()
          report(RingPlayback(source.name, null))
        }
      }
      created.setDataSource(source.url)
      created.prepareAsync()
      val expire = Runnable { onFailure(ring, created, "the station did not start in ${STREAM_DEADLINE_MILLIS / MILLIS} seconds") }
      deadline = expire
      handler.postDelayed(expire, STREAM_DEADLINE_MILLIS)
    } catch (failure: IOException) {
      NativeLog.warn(SCOPE, "sound.failed", failure) { mapOf("kind" to "radio") }
      onFailure(ring, created, failure.message.orEmpty())
    } catch (failure: IllegalStateException) {
      NativeLog.warn(SCOPE, "sound.failed", failure) { mapOf("kind" to "radio") }
      onFailure(ring, created, failure.message.orEmpty())
    }
  }

  private fun onFailure(ring: PhoneRing, failed: MediaPlayer, reason: String): Boolean {
    if (player !== failed) {
      return true
    }
    stop()
    NativeLog.warn(SCOPE, "sound.unavailable") { mapOf("kind" to ring.sound.title, "reason" to reason) }
    begin(ring, RingSoundPlan.fallback(ring.sound, reason))
    return true
  }

  private fun giveUp(ring: PhoneRing, reason: String) {
    NativeLog.error(SCOPE, "sound.none") { mapOf("ringKey" to ring.ringKey, "reason" to reason) }
    report(RingPlayback(null, "no sound could play ($reason); the phone is vibrating instead"))
  }

  private fun open(uri: Uri, ring: PhoneRing): MediaPlayer? {
    val created = MediaPlayer()
    return try {
      prepare(created)
      created.setDataSource(context, uri)
      created.prepare()
      created.setVolume(RingRamp.FLOOR, RingRamp.FLOOR)
      created
    } catch (failure: IOException) {
      NativeLog.warn(SCOPE, "sound.failed", failure) { mapOf("sound" to ring.sound.title) }
      created.release()
      null
    } catch (failure: IllegalStateException) {
      NativeLog.warn(SCOPE, "sound.failed", failure) { mapOf("sound" to ring.sound.title) }
      created.release()
      null
    }
  }

  private fun prepare(created: MediaPlayer) {
    created.setAudioAttributes(ALARM_ATTRIBUTES)
    created.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
    created.isLooping = true
    created.setVolume(RingRamp.FLOOR, RingRamp.FLOOR)
  }

  private fun toneUri(id: String): Uri? =
    if (id == RingSound.DEFAULT_TONE) defaultUri() else Uri.parse(id)

  private fun defaultUri(): Uri? =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  companion object {
    private const val SCOPE = "planner-alarm"
    private const val MILLIS = 1000L
    const val STREAM_DEADLINE_MILLIS = 8_000L
    val ALARM_ATTRIBUTES: AudioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
      .build()
  }
}
