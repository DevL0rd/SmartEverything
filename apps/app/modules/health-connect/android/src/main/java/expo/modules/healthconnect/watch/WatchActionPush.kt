package expo.modules.healthconnect.watch

import android.content.Context
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.phone.PhonePostWorker
import expo.modules.healthconnect.push.ActionAnswer
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.WatchActionPayload
import expo.modules.healthconnect.push.pushPayload
import java.time.Instant
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject

object WatchActionPush : PushCommandHandler {
  private const val TAG = "SmartEverythingWatch"
  private const val READY_TIMEOUT_MS = 18_000L
  private const val EXPIRY_MARGIN_MS = 2_000L

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<WatchActionPayload>()
    } catch (failure: SerializationException) {
      Log.e(TAG, "A watch action push could not be read: ${failure.message}")
      return
    }
    if (WatchStore(context).active().none { it.deviceId == payload.deviceId }) {
      Log.i(TAG, "Watch action ${payload.requestId} left to the phone that bridges ${payload.deviceId}")
      return
    }
    val wait = minOf(READY_TIMEOUT_MS, payload.expiresAt.toEpochMilli() - System.currentTimeMillis() - EXPIRY_MARGIN_MS)
    if (wait <= 0) {
      Log.w(TAG, "Watch action ${payload.requestId} expired before it arrived (hub deadline ${payload.expiresAt}, phone clock ${Instant.now()}); if this repeats the phone clock is ahead of the hub")
      return
    }
    run(context, payload.requestId, payload.deviceId, payload.action, wait)
  }

  private fun run(context: Context, requestId: String, deviceId: String, action: JsonObject, wait: Long) {
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
    val body = HubJson.encode(ActionAnswer(requestId, outcome.ok, outcome.detail))
    WorkManager.getInstance(context).enqueue(PhonePostWorker.requestText(PhonePostWorker.WATCH_ANSWER_PATH, body))
  }
}
