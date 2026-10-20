package expo.modules.healthconnect.treadmill

import android.content.Context
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.phone.PhonePostWorker
import expo.modules.healthconnect.push.ActionAnswer
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.TreadmillActionPayload
import expo.modules.healthconnect.push.pushPayload
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.SerializationException

object TreadmillActionPush : PushCommandHandler {
  private const val TAG = "SmartEverythingTreadmill"

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<TreadmillActionPayload>()
    } catch (failure: SerializationException) {
      Log.e(TAG, "A treadmill command could not be read: ${failure.message}")
      return
    }
    val plan = TreadmillStore(context).byDevice(payload.deviceId)
    if (plan == null || !plan.holder) {
      Log.i(TAG, "Treadmill command ${payload.requestId} left to the phone that holds ${payload.deviceId}")
      return
    }
    if (!payload.expiresAt.isAfter(Instant.now())) {
      Log.w(TAG, "Treadmill command ${payload.requestId} expired before it arrived (hub deadline ${payload.expiresAt}, phone clock ${Instant.now()})")
      return
    }
    val link = TreadmillLinks.of(payload.deviceId)
    if (link == null) {
      answer(context, payload.requestId, false, "The treadmill is not linked to this phone; open SmartEverything next to it and let it connect first.")
      return
    }
    val answered = AtomicBoolean(false)
    link.run(payload.steps) { ok, detail ->
      if (answered.compareAndSet(false, true)) answer(context, payload.requestId, ok, detail)
    }
  }

  private fun answer(context: Context, requestId: String, ok: Boolean, detail: String) {
    val body = HubJson.encode(ActionAnswer(requestId, ok, detail))
    WorkManager.getInstance(context).enqueue(PhonePostWorker.requestText(PhonePostWorker.TREADMILL_ANSWER_PATH, body))
  }
}
