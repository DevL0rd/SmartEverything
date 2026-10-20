package expo.modules.healthconnect.toothbrush

import android.content.Context
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.phone.PhonePostWorker
import expo.modules.healthconnect.push.ActionAnswer
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.BrushActionPayload
import expo.modules.healthconnect.push.pushPayload
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.SerializationException

object BrushActionPush : PushCommandHandler {
  private const val TAG = "SmartEverythingToothbrush"

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<BrushActionPayload>()
    } catch (failure: SerializationException) {
      Log.e(TAG, "A toothbrush command could not be read: ${failure.message}")
      return
    }
    val plan = BrushStore(context).byDevice(payload.deviceId)
    if (plan == null || !plan.holder) {
      Log.i(TAG, "Toothbrush command ${payload.requestId} left to the phone that holds ${payload.deviceId}")
      return
    }
    if (!payload.expiresAt.isAfter(Instant.now())) {
      Log.w(TAG, "Toothbrush command ${payload.requestId} expired before it arrived (hub deadline ${payload.expiresAt}, phone clock ${Instant.now()})")
      return
    }
    val link = BrushLinks.of(payload.deviceId)
    if (link == null) {
      answer(context, payload.requestId, false, "The brush is asleep: lift it near this phone and try again.")
      return
    }
    val answered = AtomicBoolean(false)
    link.run(payload.steps) { ok, detail ->
      if (answered.compareAndSet(false, true)) answer(context, payload.requestId, ok, detail)
    }
  }

  private fun answer(context: Context, requestId: String, ok: Boolean, detail: String) {
    val body = HubJson.encode(ActionAnswer(requestId, ok, detail))
    WorkManager.getInstance(context).enqueue(PhonePostWorker.requestText(PhonePostWorker.SONICARE_ANSWER_PATH, body))
  }
}
