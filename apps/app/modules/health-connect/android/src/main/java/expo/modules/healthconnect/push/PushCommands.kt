package expo.modules.healthconnect.push

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.DomainConstants
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.calls.IncomingCallCancelPush
import expo.modules.healthconnect.calls.IncomingCallPush
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.phone.PhoneActionPush
import expo.modules.healthconnect.phone.PhoneApprovalCancelPush
import expo.modules.healthconnect.phone.PhoneApprovalPush
import expo.modules.healthconnect.larq.BottleActionPush
import expo.modules.healthconnect.toothbrush.BrushActionPush
import expo.modules.healthconnect.treadmill.TreadmillActionPush
import expo.modules.healthconnect.watch.WatchActionPush
import expo.modules.healthconnect.speech.AiSpeechPush

object PushCommands {
  val HANDLERS: Map<String, PushCommandHandler> = mapOf(
    DomainConstants.PUSH_COMMAND_PHONE_ACTION to PhoneActionPush,
    DomainConstants.PUSH_COMMAND_MACHINE_APPROVAL to PhoneApprovalPush,
    DomainConstants.PUSH_COMMAND_MACHINE_APPROVAL_CANCEL to PhoneApprovalCancelPush,
    DomainConstants.PUSH_COMMAND_WATCH_ACTION to WatchActionPush,
    DomainConstants.PUSH_COMMAND_TREADMILL_ACTION to TreadmillActionPush,
    DomainConstants.PUSH_COMMAND_BOTTLE_ACTION to BottleActionPush,
    DomainConstants.PUSH_COMMAND_TOOTHBRUSH_ACTION to BrushActionPush,
    DomainConstants.PUSH_COMMAND_AI_SPEECH to AiSpeechPush,
    DomainConstants.PUSH_COMMAND_AI_RING to IncomingCallPush,
    DomainConstants.PUSH_COMMAND_AI_RING_CANCEL to IncomingCallCancelPush,
  )

  fun run(context: Context, data: Map<String, String>) {
    val command = data[DomainConstants.PUSH_COMMAND_KEY]
    val handler = command?.let { HANDLERS[it] }
    if (handler == null) {
      Log.e("SmartEverythingPush", "push command \"$command\" has no handler; expected one of ${HANDLERS.keys}")
      NativeLog.warn("push", "command.unhandled") { mapOf("command" to command?.take(40), "keys" to data.size) }
      return
    }
    val started = System.nanoTime()
    NativeLog.info("push", "command.received") { mapOf("command" to command, "keys" to data.keys.size) }
    NativeGuard.run("push command $command") { handler.handle(context, data) }
    NativeLog.debug("push", "command.handled", NativeLog.elapsedMs(started)) { mapOf("command" to command) }
  }
}
