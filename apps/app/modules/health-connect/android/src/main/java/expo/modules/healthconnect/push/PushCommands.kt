package expo.modules.healthconnect.push

import expo.modules.healthconnect.calls.IncomingCallCancelPush
import expo.modules.healthconnect.calls.IncomingCallPush
import expo.modules.healthconnect.phone.PhoneActionPush

object PushCommands {
  const val KEY = "command"

  val HANDLERS: Map<String, PushCommandHandler> = mapOf(
    "phone_action" to PhoneActionPush,
    "ai_ring" to IncomingCallPush,
    "ai_ring_cancel" to IncomingCallCancelPush,
  )
}
