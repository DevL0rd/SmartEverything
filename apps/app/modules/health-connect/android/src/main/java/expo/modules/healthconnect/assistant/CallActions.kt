package expo.modules.healthconnect.assistant

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.NativeGuard

object CallActions {
  const val MUTE = "toggle_mute"
  const val STOP_SCREEN = "stop_screen"
  const val END = "end"
  private const val INTENT_PREFIX = "expo.modules.healthconnect.assistant.call."

  fun pending(context: Context, action: String): PendingIntent = PendingIntent.getBroadcast(
    context,
    action.hashCode(),
    Intent(context, CallActionReceiver::class.java).setAction(INTENT_PREFIX + action).setPackage(context.packageName),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  fun actionOf(intent: Intent): String? = intent.action?.removePrefix(INTENT_PREFIX)?.takeIf { it != intent.action }
}

class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("CallActionReceiver") {
    CallActions.actionOf(intent)?.let(AssistantCallEvents::control)
  }
}
