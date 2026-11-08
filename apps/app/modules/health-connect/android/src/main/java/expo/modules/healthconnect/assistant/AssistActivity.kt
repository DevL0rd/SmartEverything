package expo.modules.healthconnect.assistant

import android.app.Activity
import android.os.Bundle
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import expo.modules.healthconnect.overlay.OverlayHostRule
import expo.modules.healthconnect.overlay.OverlayPrefs
import expo.modules.healthconnect.overlay.SessionStart

class AssistActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val foreground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
    val press = OverlayPrefs.load(this).powerButton
    when (OverlayHostRule.sessionStart(foreground, AssistantCalls.running(), false, press)) {
      SessionStart.VoiceInApp -> AssistantCallEvents.voiceMessage()
      SessionStart.OpenVoiceMessage -> startActivity(AssistantLink.voiceMessage(this))
      SessionStart.OpenApp, SessionStart.HostOnly, SessionStart.StartCall ->
        startActivity(AssistantLink.call(this, "assist"))
    }
    finish()
  }
}
