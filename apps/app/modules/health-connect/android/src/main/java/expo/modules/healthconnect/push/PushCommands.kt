package expo.modules.healthconnect.push

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.calls.IncomingCallCancelPush
import expo.modules.healthconnect.calls.IncomingCallPush
import expo.modules.healthconnect.phone.PhoneActionPush
import expo.modules.healthconnect.watch.WatchActionPush
import expo.modules.healthconnect.speech.AiSpeechPush

object PushCommands {
  const val KEY = "command"

  val HANDLERS: Map<String, PushCommandHandler> = mapOf(
    "phone_action" to PhoneActionPush,
    "watch_action" to WatchActionPush,
    "ai_speech" to AiSpeechPush,
    "ai_ring" to IncomingCallPush,
    "ai_ring_cancel" to IncomingCallCancelPush,
  )

  fun run(context: Context, data: Map<String, String>) {
    val command = data[KEY]
    val handler = command?.let { HANDLERS[it] }
    if (handler == null) {
      Log.e("SmartEverythingPush", "push command \"$command\" has no handler; expected one of ${HANDLERS.keys}")
      return
    }
    NativeGuard.run("push command $command") { handler.handle(context, data) }
  }
}
