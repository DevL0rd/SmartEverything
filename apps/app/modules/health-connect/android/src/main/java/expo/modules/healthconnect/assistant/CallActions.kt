package expo.modules.healthconnect.assistant

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.overlay.OverlayControl

object CallActions {
  private const val INTENT_PREFIX = "expo.modules.healthconnect.assistant.call."

  fun pending(context: Context, control: OverlayControl): PendingIntent = PendingIntent.getBroadcast(
    context,
    control.ordinal,
    Intent(context, CallActionReceiver::class.java).setAction(INTENT_PREFIX + control.name).setPackage(context.packageName),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  fun controlOf(intent: Intent): OverlayControl? {
    val name = intent.action?.removePrefix(INTENT_PREFIX)?.takeIf { it != intent.action } ?: return null
    return OverlayControl.entries.firstOrNull { it.name == name }
  }
}

class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("CallActionReceiver") {
    CallActions.controlOf(intent)?.let { AssistantCalls.command(context, it) }
  }
}
