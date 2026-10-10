package expo.modules.healthconnect.assistant

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class AssistantCallModule : Module() {
  private var forwarding: Job? = null
  private var call: AssistantCall? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AssistantCall")

    Events(MESSAGE_EVENT, CLOSED_EVENT)

    OnStartObserving(MESSAGE_EVENT) {
      forwarding = appContext.backgroundCoroutineScope.launch {
        AssistantCallEvents.events.collect { event ->
          when (event) {
            is AssistantCallEvent.Message -> sendEvent(MESSAGE_EVENT, mapOf("json" to event.json))
            is AssistantCallEvent.Closed -> sendEvent(CLOSED_EVENT, mapOf("code" to event.code, "reason" to event.reason))
          }
        }
      }
    }

    OnStopObserving(MESSAGE_EVENT) {
      forwarding?.cancel()
      forwarding = null
    }

    AsyncFunction("openAssistantCall") { serverUrl: String, token: String ->
      call?.close()
      call = AssistantCall(context, serverUrl, token).also { it.open() }
    }

    AsyncFunction("beginAssistantCall") { callId: String, source: String, device: String, chatId: String? ->
      call?.begin(callId, source, device, chatId)
    }

    AsyncFunction("answerAssistantCall") { callId: String, source: String, device: String, chatId: String?, answering: String ->
      call?.begin(callId, source, device, chatId, answering)
    }

    AsyncFunction("muteAssistantCall") { callId: String, muted: Boolean ->
      call?.mute(callId, muted)
    }

    AsyncFunction("endAssistantCall") { callId: String? ->
      call?.end(callId)
      call = null
    }

    Function("assistantCallLevel") {
      call?.inputLevel ?: 0.0
    }

    OnDestroy {
      call?.close()
      call = null
    }
  }

  private companion object {
    const val MESSAGE_EVENT = "onAssistantMessage"
    const val CLOSED_EVENT = "onAssistantClosed"
  }
}
