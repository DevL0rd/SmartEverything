package expo.modules.healthconnect.calls

import android.content.Intent
import android.os.SystemClock
import expo.modules.healthconnect.DomainConstants
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.push.IncomingCallPayload
import kotlinx.serialization.SerializationException

class IncomingCall(
  val outreachId: String,
  val chatId: String,
  val caller: String,
  val reason: String,
  val endsAt: Long
) {
  val notificationId: Int get() = outreachId.hashCode()

  fun remainingMs(): Long = endsAt - SystemClock.elapsedRealtime()

  fun into(intent: Intent): Intent = intent
    .putExtra(OUTREACH, outreachId)
    .putExtra(CHAT, chatId)
    .putExtra(CALLER, caller)
    .putExtra(REASON, reason)
    .putExtra(ENDS, endsAt)

  companion object {
    private const val OUTREACH = "outreachId"
    private const val CHAT = "chatId"
    private const val CALLER = "caller"
    private const val REASON = "reason"
    private const val ENDS = "endsAt"
    const val RING_MS = DomainConstants.OUTREACH_RING_SECONDS * 1000L

    fun fromPayload(payload: String): IncomingCall {
      val call = try {
        HubJson.decode<IncomingCallPayload>(payload)
      } catch (failure: SerializationException) {
        throw IncomingCallInvalid(failure.message.orEmpty(), failure)
      }
      return IncomingCall(
        outreachId = call.outreachId,
        chatId = call.chatId,
        caller = call.caller,
        reason = call.reason,
        endsAt = SystemClock.elapsedRealtime() + RING_MS
      )
    }

    fun fromIntent(intent: Intent): IncomingCall? {
      val outreachId = intent.getStringExtra(OUTREACH) ?: return null
      return IncomingCall(
        outreachId = outreachId,
        chatId = intent.getStringExtra(CHAT) ?: return null,
        caller = intent.getStringExtra(CALLER) ?: return null,
        reason = intent.getStringExtra(REASON) ?: return null,
        endsAt = intent.getLongExtra(ENDS, 0L)
      )
    }
  }
}

class IncomingCallInvalid(detail: String, cause: Throwable? = null) : Exception("An AI call push could not be read: $detail", cause)
