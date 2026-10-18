package expo.modules.healthconnect.assistant

import android.app.Activity
import android.content.Context
import android.media.projection.MediaProjectionManager
import android.net.Uri
import expo.modules.healthconnect.calls.IncomingCall
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.diagnostics.NativeTally
import expo.modules.healthconnect.calls.IncomingCalls
import expo.modules.kotlin.Promise
import expo.modules.kotlin.events.OnActivityResultPayload
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import expo.modules.healthconnect.overlay.CallOwner
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class NoActiveCall : Exception("There is no assistant call running, so this cannot be done")

class AssistantCallModule : Module() {
  private class PendingShare(val sampling: FrameSampling, val promise: Promise)

  private var forwarding: Job? = null
  private var deviceWatch: AutoCloseable? = null
  private var pendingShare: PendingShare? = null
  private var overlayForwarding: Job? = null

  private val call: AssistantCall?
    get() = AssistantCalls.current

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun running(): AssistantCall = call ?: throw NoActiveCall()

  override fun definition() = ModuleDefinition {
    Name("AssistantCall")

    Events(MESSAGE_EVENT, CLOSED_EVENT, LINK_EVENT, CONTROL_EVENT, DEVICES_EVENT, OVERLAY_EVENT)

    observing()
    callFunctions()
    audioFunctions()
    sightFunctions()
    ringFunctions()
    overlayFunctions { context }
    lifecycle()
  }

  private fun ModuleDefinitionBuilder.observing() {
    OnStartObserving(MESSAGE_EVENT) {
      forwarding = appContext.backgroundCoroutineScope.launch {
        AssistantCallEvents.events.collect { forward(it) }
      }
    }

    OnStopObserving(MESSAGE_EVENT) {
      forwarding?.cancel()
      forwarding = null
    }

    OnStartObserving(DEVICES_EVENT) {
      deviceWatch = CallDevices(context).watch { sendEvent(DEVICES_EVENT, mapOf("json" to CallDevices(context).json())) }
    }

    OnStopObserving(DEVICES_EVENT) {
      deviceWatch?.close()
      deviceWatch = null
    }

    OnStartObserving(OVERLAY_EVENT) {
      overlayForwarding = appContext.backgroundCoroutineScope.launch {
        AssistantCallEvents.overlayActions.collect { sendEvent(OVERLAY_EVENT, mapOf("action" to it)) }
      }
    }

    OnStopObserving(OVERLAY_EVENT) {
      overlayForwarding?.cancel()
      overlayForwarding = null
    }
  }

  private fun ModuleDefinitionBuilder.callFunctions() {
    AsyncFunction("openAssistantCall") { serverUrl: String, token: String, enrollment: String ->
      AssistantCalls.openForApp(context, serverUrl, token, enrollment)
    }

    Function("attachAssistantCall") {
      AssistantCalls.attach()
    }

    AsyncFunction("beginAssistantCall") { callId: String, source: String, device: String, chatId: String? ->
      running().begin(callId, source, device, chatId)
    }

    AsyncFunction("answerAssistantCall") { callId: String, source: String, device: String, chatId: String?, answering: String ->
      running().begin(callId, source, device, chatId, answering)
    }

    AsyncFunction("muteAssistantCall") { callId: String, muted: Boolean ->
      call?.mute(callId, muted)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("sendAssistantCallMessage") { json: String ->
      running().sendJson(json)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("endAssistantCall") { callId: String? ->
      call?.end(callId)
    }

    Function("assistantCallLevel") {
      call?.inputLevel ?: 0.0
    }

    Function("assistantCallOutputLevel") {
      call?.outputLevel ?: 0.0
    }
  }

  private fun ModuleDefinitionBuilder.audioFunctions() {
    AsyncFunction("applyAssistantCallAudio") { settings: CallAudioSettings ->
      CallAudioStore.remember(context, settings)
      call?.apply(settings)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("runAssistantEchoTest") { promise: Promise ->
      measureEcho(promise)
    }

    Function("assistantAudioDevices") {
      CallDevices(context).json()
    }
  }

  private fun ModuleDefinitionBuilder.sightFunctions() {
    AsyncFunction("sendAssistantCallFrame") { uri: String, sampling: FrameSampling, still: Boolean ->
      running().sight.cameraFrame(Uri.parse(uri).path.orEmpty(), sampling, still)
    }

    AsyncFunction("setAssistantCallCamera") { on: Boolean ->
      running().sight.cameraOn(on)
      appContext.currentActivity?.let { CallPip.want(it, on) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startAssistantScreenShare") { sampling: FrameSampling, promise: Promise ->
      askForProjection(sampling, promise)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setAssistantScreenLive") { live: Boolean ->
      call?.sight?.setScreenLive(live)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("captureAssistantScreenStill") { promise: Promise ->
      running().sight.screenStill { promise.resolve(it) }
    }

    AsyncFunction("stopAssistantScreenShare") {
      call?.sight?.stopScreen()
    }.runOnQueue(Queues.MAIN)
  }

  private fun ModuleDefinitionBuilder.ringFunctions() {
    AsyncFunction("ringIncomingCall") { payload: String ->
      IncomingCalls.ring(context, IncomingCall.fromPayload(payload))
    }

    AsyncFunction("dismissIncomingCall") { outreachId: String ->
      IncomingCalls.dismiss(context, outreachId)
    }
  }

  private fun ModuleDefinitionBuilder.lifecycle() {
    OnActivityResult { _, payload -> finishProjection(payload) }

    OnUserLeavesActivity {
      appContext.currentActivity?.let(CallPip::enterIfWanted)
    }

    OnActivityEntersForeground {
      IncomingCalls.appForeground = true
      appContext.currentActivity?.let(CallPip::refresh)
    }

    OnActivityEntersBackground {
      IncomingCalls.appForeground = false
    }

    OnDestroy {
      IncomingCalls.appForeground = false
      call?.takeIf { it.owner == CallOwner.App }?.close()
    }
  }

  private val messages = NativeTally("assistant-call", "message.summary")

  private fun forward(event: AssistantCallEvent) {
    when (event) {
      is AssistantCallEvent.Message -> {
        messages.add(0)
        sendEvent(MESSAGE_EVENT, mapOf("json" to event.json))
      }
      is AssistantCallEvent.Closed -> {
        NativeLog.info("assistant-call", "call.closed") { mapOf("closeCode" to event.code, "reason" to NativeLog.reasonText(event.reason)) }
        sendEvent(CLOSED_EVENT, mapOf("code" to event.code, "reason" to event.reason))
      }
      is AssistantCallEvent.Link -> {
        NativeLog.info("assistant-call", "link.changed") { mapOf("state" to event.state) }
        sendEvent(LINK_EVENT, mapOf("state" to event.state))
      }
      is AssistantCallEvent.Control -> {
        NativeLog.debug("assistant-call", "control.sent") { mapOf("action" to event.action) }
        sendEvent(CONTROL_EVENT, mapOf("action" to event.action))
      }
    }
  }

  private fun askForProjection(sampling: FrameSampling, promise: Promise) {
    running()
    val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
    pendingShare?.promise?.resolve(false)
    pendingShare = PendingShare(sampling, promise)
    val manager = activity.getSystemService(MediaProjectionManager::class.java)
    activity.startActivityForResult(ScreenConsent.intent(manager), REQUEST_PROJECTION)
  }

  private fun finishProjection(payload: OnActivityResultPayload) {
    if (payload.requestCode != REQUEST_PROJECTION) return
    val pending = pendingShare ?: return
    pendingShare = null
    val consent = payload.data
    if (payload.resultCode != Activity.RESULT_OK || consent == null) {
      pending.promise.resolve(false)
      return
    }
    try {
      running().sight.startScreen(payload.resultCode, consent, pending.sampling)
      pending.promise.resolve(true)
    } catch (failure: Exception) {
      pending.promise.reject(CodedException(failure))
    }
  }

  private fun measureEcho(promise: Promise) {
    val active = call
    Thread(
      {
        try {
          active?.hold(true)
          promise.resolve(EchoTest(context, CallDevices(context), CallAudioStore.latest).run().toString())
        } catch (failure: Exception) {
          promise.reject(CodedException(failure))
        } finally {
          active?.hold(false)
        }
      },
      "smarteverything-echo-test"
    ).start()
  }

  private companion object {
    const val MESSAGE_EVENT = "onAssistantMessage"
    const val CLOSED_EVENT = "onAssistantClosed"
    const val LINK_EVENT = "onAssistantLink"
    const val CONTROL_EVENT = "onAssistantControl"
    const val DEVICES_EVENT = "onAssistantDevices"
    const val OVERLAY_EVENT = "onOverlayAction"
    const val REQUEST_PROJECTION = 0x5C41
  }
}
