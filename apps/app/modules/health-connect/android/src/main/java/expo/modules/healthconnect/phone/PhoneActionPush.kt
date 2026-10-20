package expo.modules.healthconnect.phone

import android.content.Context
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.push.ActionAnswer
import expo.modules.healthconnect.push.PhoneActionOrigin
import expo.modules.healthconnect.push.PhoneActionPayload
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.pushPayload
import kotlinx.serialization.SerializationException
import org.json.JSONException
import org.json.JSONObject

object PhoneActionPush : PushCommandHandler {
  private const val TAG = "SmartEverythingPhone"

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<PhoneActionPayload>()
    } catch (failure: SerializationException) {
      Log.e(TAG, "A phone action push could not be read: ${failure.message}")
      return
    }
    val action = JSONObject(payload.action.toString())
    if (receivesFile(action)) {
      PhoneFileWorker.enqueue(context, payload.requestId, action, payload.origin)
      return
    }
    answer(context, payload.requestId, runSafely(context, action, payload.origin))
  }

  internal fun receivesFile(action: JSONObject): Boolean = action.optString("type") == PhoneActionType.RECEIVE_FILE.wire

  fun runSafely(context: Context, action: JSONObject, origin: PhoneActionOrigin): PhoneActionResult = try {
    PhoneActions.run(context, action, origin)
  } catch (failure: PhoneFailure) {
    PhoneActionResult(false, failure.message.orEmpty())
  } catch (failure: JSONException) {
    PhoneActionResult(false, "The request could not be read: ${failure.message}")
  }

  fun answer(context: Context, requestId: String, result: PhoneActionResult) {
    val body = HubJson.encode(ActionAnswer(requestId, result.ok, result.detail, result.image))
    WorkManager.getInstance(context).enqueue(PhonePostWorker.sizedRequest(context, PhonePostWorker.ANSWER_PATH, body))
  }
}
