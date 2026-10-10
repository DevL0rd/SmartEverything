package expo.modules.healthconnect.assistant

import android.content.Context
import android.os.Build
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService

class AssistantSessionService : VoiceInteractionSessionService() {
  override fun onNewSession(args: Bundle?): VoiceInteractionSession = AssistantSession(this)
}

class AssistantSession(context: Context) : VoiceInteractionSession(context) {
  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    val intent = AssistantLink.call(context, "assistant")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startAssistantActivity(intent)
    } else {
      context.startActivity(intent)
    }
    finish()
  }
}
