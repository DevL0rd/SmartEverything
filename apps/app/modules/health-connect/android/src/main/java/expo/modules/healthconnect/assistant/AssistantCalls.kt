package expo.modules.healthconnect.assistant

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.ServiceStartRefused
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.listening.ListeningService
import expo.modules.healthconnect.overlay.CallFacts
import expo.modules.healthconnect.overlay.CallOverlayState
import expo.modules.healthconnect.overlay.CallOwner
import expo.modules.healthconnect.overlay.OverlayControl
import expo.modules.healthconnect.overlay.OverlayStage
import expo.modules.healthconnect.overlay.OverlayTile
import expo.modules.healthconnect.overlay.TileRoute
import expo.modules.healthconnect.overlay.TileRouting
import expo.modules.healthconnect.overlay.ProblemFix
import expo.modules.healthconnect.relayTarget
import java.net.URL
import java.util.UUID

class CallSettingsMissing : Exception("Open SmartEverything once so calls know your audio settings")

object AssistantCalls {
  const val ASSIST = "assist"
  private const val DEVICE = "the phone"
  private const val SCOPE = "assistant-call"
  private const val MICROPHONE = "Allow the microphone for SmartEverything"
  private const val IN_A_CALL = "in a call"

  @Volatile
  var current: AssistantCall? = null
    private set

  @Volatile
  private var lastOwner = CallOwner.App

  private var restedEar: Context? = null

  @Synchronized
  fun openForApp(context: Context, serverUrl: String, token: String, enrollment: String) {
    current?.close()
    configureServer(context, serverUrl, token, enrollment)
    OverlayStage.ensure(context)
    lastOwner = CallOwner.App
    val opened = AssistantCall(context, serverUrl, token, relayTarget(context), CallOwner.App, ::released)
    current = opened
    opened.open()
  }

  @Synchronized
  fun attach(): String? = current?.attach()?.also { lastOwner = CallOwner.App }?.toString()

  fun running(): Boolean = current != null

  @Synchronized
  fun startNative(context: Context, source: String) {
    OverlayStage.ensure(context)
    if (current != null) return
    val callId = UUID.randomUUID().toString()
    if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      problem(callId, MICROPHONE, ProblemFix.Microphone)
      return
    }
    try {
      val target = relayTarget(context)
      if (!CallAudioStore.restore(context)) throw CallSettingsMissing()
      CallNotice.begin(context)
      OverlayStage.wake(muted = false)
      lastOwner = CallOwner.Native
      current = nativeCall(context, target).apply { pending = NativeStart(callId, source, DEVICE) }.also { it.open() }
      ListeningService.rest(context, IN_A_CALL)
      restedEar = context.applicationContext
    } catch (failure: SyncFailure) {
      refused(callId, failure)
    } catch (failure: ServiceStartRefused) {
      refused(callId, failure)
    } catch (failure: CallSettingsMissing) {
      refused(callId, failure)
    }
  }

  fun command(context: Context, control: OverlayControl) {
    if (control == OverlayControl.Close) {
      OverlayStage.dismiss()
      return
    }
    if (lastOwner == CallOwner.App) {
      AssistantCallEvents.overlay(control)
      return
    }
    native(context, control)
  }

  fun openCallPage(context: Context, action: String? = null) {
    context.startActivity(AssistantLink.call(context, ASSIST, action))
  }

  fun tile(context: Context, tile: OverlayTile) {
    when (val route = TileRouting.of(tile)) {
      is TileRoute.Room -> OverlayStage.openApp(route.action)
      is TileRoute.Control -> command(context, route.control)
      is TileRoute.App -> AssistantCallEvents.overlayAction(route.action)
      TileRoute.Captions -> captions()
    }
  }

  private fun captions() {
    if (lastOwner == CallOwner.App) AssistantCallEvents.overlayAction(TileRouting.CAPTIONS) else OverlayStage.toggleCaptions()
  }

  private fun native(context: Context, control: OverlayControl) {
    val call = current
    when (control) {
      OverlayControl.Mute -> call?.toggleMute()
      OverlayControl.Speaker -> call?.toggleSpeaker()
      OverlayControl.Interrupt -> call?.interrupt()
      OverlayControl.End -> call?.endCall()
      OverlayControl.Retry -> {
        OverlayStage.dismiss()
        startNative(context, ASSIST)
      }
      OverlayControl.Fix -> OverlayStage.openApp()
      OverlayControl.Camera, OverlayControl.StopShare, OverlayControl.Share, OverlayControl.More, OverlayControl.Close -> Unit
    }
  }

  private fun nativeCall(context: Context, target: IngestTarget): AssistantCall =
    AssistantCall(context, URL(URL(target.endpoint), "/").toString(), target.token, target, CallOwner.Native, ::released)

  private fun refused(callId: String, failure: Exception) {
    NativeLog.warn(SCOPE, "call.native_start_refused", failure)
    problem(callId, failure.message.orEmpty())
  }

  private fun problem(callId: String, text: String, fix: ProblemFix? = null) {
    lastOwner = CallOwner.Native
    OverlayStage.call { CallOverlayState.failed(CallFacts(callId, CallOwner.Native), System.currentTimeMillis(), text, fix) }
  }

  @Synchronized
  private fun released(call: AssistantCall) {
    if (current !== call) return
    current = null
    restedEar?.let { ListeningService.resume(it) }
    restedEar = null
  }
}
