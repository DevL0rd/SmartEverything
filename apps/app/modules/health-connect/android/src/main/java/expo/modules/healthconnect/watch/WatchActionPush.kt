package expo.modules.healthconnect.watch

import android.content.Context
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.phone.PhonePostWorker
import expo.modules.healthconnect.push.PushCommandHandler
import java.time.Instant
import java.time.format.DateTimeParseException
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONException
import org.json.JSONObject

object WatchActionPush : PushCommandHandler {
  private const val TAG = "SmartEverythingWatch"
  private const val READY_TIMEOUT_MS = 18_000L
  private const val EXPIRY_MARGIN_MS = 2_000L
  private const val MAX_DETAIL = 400

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      JSONObject(data["payload"].orEmpty())
    } catch (failure: JSONException) {
      Log.e(TAG, "A watch action push could not be read: ${failure.message}")
      return
    }
    val requestId = payload.optString("requestId")
    val deviceId = payload.optString("deviceId")
    val action = payload.optJSONObject("action")
    if (requestId.isEmpty() || deviceId.isEmpty() || action == null) {
      Log.e(TAG, "A watch action push needs requestId, deviceId and action; received ${payload.keys().asSequence().toList()}")
      return
    }
    if (WatchStore(context).active().none { it.deviceId == deviceId }) {
      Log.i(TAG, "Watch action $requestId left to the phone that bridges $deviceId")
      return
    }
    val wait = waitOf(payload.optString("expiresAt"))
    if (wait <= 0) {
      Log.w(TAG, "Watch action $requestId expired before it arrived (hub deadline ${payload.optString("expiresAt")}, phone clock ${Instant.now()}); if this repeats the phone clock is ahead of the hub")
      return
    }
    run(context, requestId, deviceId, action, wait)
  }

  private fun waitOf(expiresAt: String): Long {
    if (expiresAt.isEmpty()) return READY_TIMEOUT_MS
    return try {
      val left = Instant.parse(expiresAt).toEpochMilli() - System.currentTimeMillis() - EXPIRY_MARGIN_MS
      minOf(READY_TIMEOUT_MS, left)
    } catch (failure: DateTimeParseException) {
      Log.e(TAG, "A watch action push carried an unreadable expiresAt \"$expiresAt\"")
      READY_TIMEOUT_MS
    }
  }

  private fun run(context: Context, requestId: String, deviceId: String, action: JSONObject, wait: Long) {
    val answered = AtomicBoolean(false)
    val reply = { outcome: ActionOutcome ->
      if (answered.compareAndSet(false, true)) answer(context, requestId, outcome)
    }
    val cancel = WatchActions.whenReady(deviceId, wait) { ready ->
      if (answered.get()) return@whenReady
      if (!ready) {
        reply(ActionOutcome(false, "The watch did not connect to this phone in time."))
        return@whenReady
      }
      NativeGuard.run("watch action $requestId") { WatchRemote.run(context, deviceId, action.toString(), reply) }
    }
    try {
      WatchService.send(context, WatchService.ACTION_CONNECT)
    } catch (failure: ServiceStartRefused) {
      cancel()
      reply(ActionOutcome(false, failure.message.orEmpty()))
    }
  }

  private fun answer(context: Context, requestId: String, outcome: ActionOutcome) {
    val body = JSONObject().put("requestId", requestId).put("ok", outcome.ok).put("detail", outcome.detail.take(MAX_DETAIL))
    WorkManager.getInstance(context).enqueue(PhonePostWorker.request(PhonePostWorker.WATCH_ANSWER_PATH, body))
  }
}
