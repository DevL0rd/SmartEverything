package expo.modules.healthconnect.assistant

import android.app.KeyguardManager
import android.content.Context
import android.os.Bundle
import android.provider.Settings
import android.service.voice.VoiceInteractionService
import expo.modules.healthconnect.overlay.OverlayHostRule
import expo.modules.healthconnect.overlay.OverlayStage

class AssistantInteractionService : VoiceInteractionService() {
  override fun onReady() {
    super.onReady()
    active = this
    OverlayStage.ensure(this)
  }

  override fun onShutdown() {
    if (active === this) active = null
    super.onShutdown()
  }

  override fun onLaunchVoiceAssistFromKeyguard() {
    showSession(Bundle(), 0)
  }

  companion object {
    const val SOURCE = "source"
    const val WAKE = "wake"

    @Volatile
    var active: AssistantInteractionService? = null
      private set

    fun showForWake(context: Context): Boolean {
      val service = active ?: return false
      val locked = context.getSystemService(KeyguardManager::class.java).isKeyguardLocked
      if (!OverlayHostRule.sessionKeeps(locked, Settings.canDrawOverlays(context))) return false
      OverlayStage.ensure(context)
      OverlayStage.wake(muted = false)
      service.showSession(Bundle().apply { putString(SOURCE, WAKE) }, 0)
      return true
    }
  }
}
