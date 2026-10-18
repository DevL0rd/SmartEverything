package expo.modules.healthconnect.speech

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.push.AiSpeechPayload
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.pushPayload
import kotlinx.serialization.SerializationException

object AiSpeechPush : PushCommandHandler {
  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<AiSpeechPayload>()
    } catch (failure: SerializationException) {
      Log.e(AiSpeechService.TAG, "An AI speech push could not be read: ${failure.message}")
      return
    }
    try {
      AiSpeechService.start(context, payload.id)
    } catch (failure: ServiceStartRefused) {
      Log.e(AiSpeechService.TAG, failure.message.orEmpty())
    }
  }
}
