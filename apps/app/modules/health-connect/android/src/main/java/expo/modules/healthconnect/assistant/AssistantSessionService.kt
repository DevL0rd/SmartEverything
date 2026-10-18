package expo.modules.healthconnect.assistant

import android.content.Context
import android.graphics.Color
import android.graphics.Region
import android.graphics.drawable.ColorDrawable
import android.os.Build
import android.os.Bundle
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
import android.view.View
import android.view.WindowManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ProcessLifecycleOwner
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.overlay.OverlayHostRule
import expo.modules.healthconnect.overlay.OverlayParts
import expo.modules.healthconnect.overlay.OverlayPrefs
import expo.modules.healthconnect.overlay.OverlaySessionHost
import expo.modules.healthconnect.overlay.OverlayStage
import expo.modules.healthconnect.overlay.OverlayStyle
import expo.modules.healthconnect.overlay.OverlayView
import expo.modules.healthconnect.overlay.OverlayViewState
import expo.modules.healthconnect.overlay.SessionStart

class AssistantSessionService : VoiceInteractionSessionService() {
  override fun onNewSession(args: Bundle?): VoiceInteractionSession = AssistantSession(this)
}

class AssistantSession(context: Context) : VoiceInteractionSession(context), OverlaySessionHost {
  private val touch = Region()
  private var overlay: OverlayView? = null

  override fun onCreate() {
    super.onCreate()
    OverlayStage.ensure(context)
    window.window?.apply {
      setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
      clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
    }
  }

  override fun onCreateContentView(): View {
    val prefs = OverlayPrefs.load(context)
    val style = OverlayStyle(prefs.theme, OverlayStyle.systemReducedMotion(), prefs.glow)
    return OverlayView(context, OverlayParts.Both, style, OverlayStage.actions).also {
      it.setLevelSources(OverlayStage.levels.input, OverlayStage.levels.output)
      overlay = it
    }
  }

  override fun onShow(args: Bundle?, showFlags: Int) {
    super.onShow(args, showFlags)
    val foreground = ProcessLifecycleOwner.get().lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)
    val wake = args?.getString(AssistantInteractionService.SOURCE) == AssistantInteractionService.WAKE
    val start = OverlayHostRule.sessionStart(foreground, AssistantCalls.running(), wake)
    NativeLog.info("assistant-session", "session.shown") { mapOf("start" to start.name, "foreground" to foreground, "wake" to wake) }
    when (start) {
      SessionStart.OpenApp -> {
        openApp(null)
        hide()
      }
      SessionStart.HostOnly -> OverlayStage.attachSession(this)
      SessionStart.StartCall -> {
        AssistantCalls.startNative(context, AssistantCalls.ASSIST)
        OverlayStage.attachSession(this)
      }
    }
  }

  override fun onHide() {
    OverlayStage.detachSession(this)
    super.onHide()
  }

  override fun onDestroy() {
    overlay?.release()
    overlay = null
    OverlayStage.detachSession(this)
    super.onDestroy()
  }

  override fun onCloseSystemDialogs() {
    if (!OverlayStage.keepsSession()) hide()
  }

  override fun onLockscreenShown() = Unit

  override fun onComputeInsets(outInsets: VoiceInteractionSession.Insets) {
    outInsets.contentInsets.setEmpty()
    outInsets.touchableInsets = VoiceInteractionSession.Insets.TOUCHABLE_INSETS_REGION
    outInsets.touchableRegion.setEmpty()
    if (overlay?.touchRegion(touch) == true) outInsets.touchableRegion.set(touch)
  }

  override fun show(view: OverlayViewState) {
    overlay?.render(view)
  }

  override fun handOver() = hide()

  override fun openApp(action: String?) {
    val intent = AssistantLink.call(context, AssistantCalls.ASSIST, action)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startAssistantActivity(intent) else context.startActivity(intent)
  }
}
