package expo.modules.healthconnect.speech

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.push.PushCommandHandler
import java.time.Instant
import java.time.format.DateTimeParseException
import org.json.JSONException
import org.json.JSONObject

object AiSpeechPush : PushCommandHandler {
  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      JSONObject(data["payload"].orEmpty())
    } catch (failure: JSONException) {
      Log.e(AiSpeechService.TAG, "An AI speech push could not be read: ${failure.message}")
      return
    }
    val id = payload.optString("id")
    if (id.isEmpty()) {
      Log.e(AiSpeechService.TAG, "An AI speech push needs an id; received ${payload.keys().asSequence().toList()}")
      return
    }
    if (expired(payload.optString("expiresAt"))) {
      Log.i(AiSpeechService.TAG, "AI speech $id expired before it arrived; the hub already gave up")
      return
    }
    try {
      AiSpeechService.start(context, id)
    } catch (failure: ServiceStartRefused) {
      Log.e(AiSpeechService.TAG, failure.message.orEmpty())
    }
  }

  private fun expired(expiresAt: String): Boolean {
    if (expiresAt.isEmpty()) return false
    return try {
      Instant.parse(expiresAt).toEpochMilli() < System.currentTimeMillis()
    } catch (failure: DateTimeParseException) {
      Log.e(AiSpeechService.TAG, "An AI speech push carried an unreadable expiresAt \"$expiresAt\"")
      false
    }
  }
}
