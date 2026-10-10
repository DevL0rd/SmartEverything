package expo.modules.healthconnect.calls

import android.content.Intent
import org.json.JSONException
import org.json.JSONObject
import java.time.Instant
import java.time.format.DateTimeParseException

class IncomingCall(
  val outreachId: String,
  val chatId: String,
  val caller: String,
  val reason: String,
  val expiresAt: Long
) {
  val notificationId: Int get() = outreachId.hashCode()

  fun expired(): Boolean = expiresAt <= System.currentTimeMillis()

  fun into(intent: Intent): Intent = intent
    .putExtra(OUTREACH, outreachId)
    .putExtra(CHAT, chatId)
    .putExtra(CALLER, caller)
    .putExtra(REASON, reason)
    .putExtra(EXPIRES, expiresAt)

  companion object {
    private const val OUTREACH = "outreachId"
    private const val CHAT = "chatId"
    private const val CALLER = "caller"
    private const val REASON = "reason"
    private const val EXPIRES = "expiresAt"

    fun fromPayload(payload: String): IncomingCall {
      val json = try {
        JSONObject(payload)
      } catch (failure: JSONException) {
        throw IncomingCallInvalid("the payload is not JSON: ${failure.message}")
      }
      return IncomingCall(
        outreachId = required(json, OUTREACH),
        chatId = required(json, CHAT),
        caller = required(json, CALLER),
        reason = required(json, REASON),
        expiresAt = instantOf(required(json, EXPIRES))
      )
    }

    fun fromIntent(intent: Intent): IncomingCall? {
      val outreachId = intent.getStringExtra(OUTREACH) ?: return null
      return IncomingCall(
        outreachId = outreachId,
        chatId = intent.getStringExtra(CHAT) ?: return null,
        caller = intent.getStringExtra(CALLER) ?: return null,
        reason = intent.getStringExtra(REASON) ?: return null,
        expiresAt = intent.getLongExtra(EXPIRES, 0L)
      )
    }

    private fun required(json: JSONObject, key: String): String {
      val value = json.optString(key)
      if (value.isEmpty() || json.isNull(key)) {
        throw IncomingCallInvalid("the payload has no $key")
      }
      return value
    }

    private fun instantOf(text: String): Long = try {
      Instant.parse(text).toEpochMilli()
    } catch (failure: DateTimeParseException) {
      throw IncomingCallInvalid("expiresAt is not a moment: $text")
    }
  }
}

class IncomingCallInvalid(detail: String) : Exception("An AI call push could not be read: $detail")
