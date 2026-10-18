package expo.modules.healthconnect.assistant

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import expo.modules.healthconnect.voice.VoiceCapture

class CallRouteRefused(output: String) :
  Exception("Android did not switch the call audio to $output; choose another speaker in the call settings")

object CallAudioMode {
  const val AUTO = "auto"
  const val SPEAKER = "speaker"
  const val EARPIECE = "earpiece"

  private var holders = 0
  private var previousMode = AudioManager.MODE_NORMAL
  private var previousSpeaker = false

  @Synchronized
  fun enter(context: Context) {
    holders += 1
    if (holders > 1) return
    val audio = context.getSystemService(AudioManager::class.java)
    previousMode = audio.mode
    previousSpeaker = audio.isSpeakerphoneOn
    audio.mode = AudioManager.MODE_IN_COMMUNICATION
  }

  @Synchronized
  fun leave(context: Context) {
    if (holders == 0) return
    holders -= 1
    if (holders > 0) return
    val audio = context.getSystemService(AudioManager::class.java)
    VoiceCapture.preferInput(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audio.clearCommunicationDevice()
    audio.isSpeakerphoneOn = previousSpeaker
    audio.mode = previousMode
  }

  fun route(context: Context, devices: CallDevices, input: String, output: String) {
    val microphone = if (input == AUTO) null else devices.input(input)
    VoiceCapture.preferInput(microphone)
    val audio = context.getSystemService(AudioManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      routeModern(audio, devices, microphone, output)
    } else {
      audio.isSpeakerphoneOn = output == SPEAKER
    }
  }

  fun speakerOf(devices: CallDevices, output: String): Boolean? {
    val choosable = devices.outputOfType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) != null &&
      devices.outputOfType(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) != null
    return if (choosable) output == SPEAKER else null
  }

  private fun routeModern(audio: AudioManager, devices: CallDevices, microphone: AudioDeviceInfo?, output: String) {
    val target = when (output) {
      SPEAKER -> devices.outputOfType(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER)
      EARPIECE -> devices.outputOfType(AudioDeviceInfo.TYPE_BUILTIN_EARPIECE)
      AUTO -> microphone?.let { devices.outputAt(it.address) }
      else -> devices.output(output)
    }
    if (target == null) {
      audio.clearCommunicationDevice()
      return
    }
    if (!audio.setCommunicationDevice(target)) throw CallRouteRefused(target.productName.toString())
  }
}
