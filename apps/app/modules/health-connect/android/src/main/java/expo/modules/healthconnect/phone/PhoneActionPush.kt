package expo.modules.healthconnect.phone

import android.content.Context
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.push.PushCommandHandler
import org.json.JSONException
import org.json.JSONObject

object PhoneActionPush : PushCommandHandler {
  private const val COMMAND = "phone_action"
  private const val TAG = "SmartEverythingPhone"

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      JSONObject(data["payload"].orEmpty())
    } catch (failure: JSONException) {
      Log.e(TAG, PhonePushPayloadInvalid(COMMAND, failure.message.orEmpty()).message.orEmpty())
      return
    }
    val requestId = payload.optString("requestId")
    val action = payload.optJSONObject("action")
    if (requestId.isEmpty() || action == null) {
      Log.e(TAG, PhonePushPayloadInvalid(COMMAND, "expected requestId and action; received ${payload.keys().asSequence().toList()}").message.orEmpty())
      return
    }
    answer(context, requestId, runSafely(context, action))
  }

  fun runSafely(context: Context, action: JSONObject): PhoneActionResult = try {
    PhoneActions.run(context, action)
  } catch (failure: PhoneFailure) {
    PhoneActionResult(false, failure.message.orEmpty())
  } catch (failure: JSONException) {
    PhoneActionResult(false, "The request could not be read: ${failure.message}")
  }

  fun answer(context: Context, requestId: String, result: PhoneActionResult) {
    val body = JSONObject().put("requestId", requestId).put("ok", result.ok).put("detail", result.detail)
    WorkManager.getInstance(context).enqueue(PhonePostWorker.request(PhonePostWorker.ANSWER_PATH, body))
  }
}
