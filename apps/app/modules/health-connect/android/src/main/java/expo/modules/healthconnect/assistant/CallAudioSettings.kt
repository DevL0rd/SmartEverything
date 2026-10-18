package expo.modules.healthconnect.assistant

import android.content.Context
import expo.modules.healthconnect.voice.GateSettings
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.records.Required
import org.json.JSONObject

class CallAudioSettings : Record {
  @Required @Field var echoTailMs: Int = 0
  @Required @Field var sustainMs: Int = 0
  @Required @Field var bargeInLevel: Double = 0.0
  @Required @Field var ignoreAssistantAudible: Boolean = false
  @Required @Field var aggressiveWhileAudible: Boolean = false
  @Required @Field var interruptible: Boolean = false
  @Required @Field var speechThreshold: Double = 0.0
  @Required @Field var minSpeechMs: Int = 0
  @Required @Field var pauseMs: Int = 0
  @Required @Field var noiseSuppression: Boolean = false
  @Required @Field var autoGain: Boolean = false
  @Required @Field var input: String = ""
  @Required @Field var output: String = ""
  @Required @Field var volume: Double = 0.0

  fun json(): JSONObject = JSONObject()
    .put("echoTailMs", echoTailMs).put("sustainMs", sustainMs).put("bargeInLevel", bargeInLevel)
    .put("ignoreAssistantAudible", ignoreAssistantAudible).put("aggressiveWhileAudible", aggressiveWhileAudible)
    .put("interruptible", interruptible).put("speechThreshold", speechThreshold).put("minSpeechMs", minSpeechMs)
    .put("pauseMs", pauseMs).put("noiseSuppression", noiseSuppression).put("autoGain", autoGain)
    .put("input", input).put("output", output).put("volume", volume)

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

  companion object {
    fun of(saved: JSONObject): CallAudioSettings = CallAudioSettings().apply {
      echoTailMs = saved.getInt("echoTailMs")
      sustainMs = saved.getInt("sustainMs")
      bargeInLevel = saved.getDouble("bargeInLevel")
      ignoreAssistantAudible = saved.getBoolean("ignoreAssistantAudible")
      aggressiveWhileAudible = saved.getBoolean("aggressiveWhileAudible")
      interruptible = saved.getBoolean("interruptible")
      speechThreshold = saved.getDouble("speechThreshold")
      minSpeechMs = saved.getInt("minSpeechMs")
      pauseMs = saved.getInt("pauseMs")
      noiseSuppression = saved.getBoolean("noiseSuppression")
      autoGain = saved.getBoolean("autoGain")
      input = saved.getString("input")
      output = saved.getString("output")
      volume = saved.getDouble("volume")
    }
  }
}

class CallAudioSettingsNotSent : IllegalStateException("The app has not sent the call audio settings yet")

object CallAudioStore {
  private const val FILE = "expo.modules.healthconnect.call-audio"
  private const val KEY = "settings"

  @Volatile
  private var sent: CallAudioSettings? = null

  val latest: CallAudioSettings
    get() = sent ?: throw CallAudioSettingsNotSent()

  fun remember(context: Context, settings: CallAudioSettings) {
    sent = settings
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit().putString(KEY, settings.json().toString()).apply()
  }

  fun restore(context: Context): Boolean {
    if (sent != null) return true
    val saved = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).getString(KEY, null) ?: return false
    sent = CallAudioSettings.of(JSONObject(saved))
    return true
  }
}
