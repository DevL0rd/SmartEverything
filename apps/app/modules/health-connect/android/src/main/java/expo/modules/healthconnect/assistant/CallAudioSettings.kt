package expo.modules.healthconnect.assistant

import expo.modules.healthconnect.voice.GateSettings
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class CallAudioSettings : Record {
  @Field var echoTailMs: Int = 300
  @Field var sustainMs: Int = 256
  @Field var bargeInLevel: Double = 0.04
  @Field var ignoreAssistantAudible: Boolean = false
  @Field var aggressiveWhileAudible: Boolean = true
  @Field var interruptible: Boolean = true
  @Field var speechThreshold: Double = GateSettings.LIBRARY_STANDARD_THRESHOLD
  @Field var minSpeechMs: Int = 64
  @Field var pauseMs: Int = 200
  @Field var noiseSuppression: Boolean = true
  @Field var autoGain: Boolean = true
  @Field var input: String = "auto"
  @Field var output: String = "speaker"
  @Field var volume: Double = 1.0

  fun gate(): GateSettings = GateSettings(
    echoTailMs = echoTailMs.toLong(),
    sustainMs = sustainMs,
    bargeInLevel = bargeInLevel,
    ignoreAssistantAudible = ignoreAssistantAudible,
    aggressiveWhileAudible = aggressiveWhileAudible,
    interruptible = interruptible,
    speechThreshold = speechThreshold,
    minSpeechMs = minSpeechMs,
    pauseMs = pauseMs
  )
}

object CallAudioStore {
  @Volatile
  var latest = CallAudioSettings()
}
