@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect.push

import android.content.Context
import expo.modules.healthconnect.DomainConstants
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.InstantSerializer
import java.time.Instant
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers
import kotlinx.serialization.json.JsonObject

fun interface PushCommandHandler {
  fun handle(context: Context, data: Map<String, String>)
}

inline fun <reified T> Map<String, String>.pushPayload(): T =
  HubJson.decode(this[DomainConstants.PUSH_PAYLOAD_KEY].orEmpty())

@Serializable
class AiSpeechPayload(val id: String)

@Serializable
class IncomingCallPayload(val outreachId: String, val chatId: String, val caller: String, val reason: String)

@Serializable
class IncomingCallCancelPayload(val outreachId: String)

@Serializable
class PhoneActionPayload(val requestId: String, val action: JsonObject)

@Serializable
class MachineApproval(val action: String, val machine: String, val source: String)

@Serializable
class MachineApprovalPayload(val requestId: String, val approval: MachineApproval, val expiresAt: Instant)

@Serializable
class MachineApprovalCancelPayload(val requestId: String)

@Serializable
class WatchActionPayload(val requestId: String, val deviceId: String, val action: JsonObject, val expiresAt: Instant)

@Serializable
class ActionAnswer(val requestId: String, val ok: Boolean, val detail: String, val image: String? = null)
