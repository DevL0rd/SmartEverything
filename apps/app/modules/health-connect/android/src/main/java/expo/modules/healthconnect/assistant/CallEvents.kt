package expo.modules.healthconnect.assistant

import expo.modules.healthconnect.overlay.OverlayControl
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

sealed interface AssistantCallEvent {
  data class Message(val json: String) : AssistantCallEvent
  data class Closed(val code: Int, val reason: String) : AssistantCallEvent
  data class Link(val state: String) : AssistantCallEvent
  data class Control(val action: String) : AssistantCallEvent
}

object AssistantCallEvents {
  internal val flow = MutableSharedFlow<AssistantCallEvent>(
    extraBufferCapacity = 256,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
  )
  val events: SharedFlow<AssistantCallEvent> = flow

  private val overlayFlow = MutableSharedFlow<String>(
    extraBufferCapacity = OVERLAY_BUFFER,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
  )
  val overlayActions: SharedFlow<String> = overlayFlow

  fun control(action: String) {
    flow.tryEmit(AssistantCallEvent.Control(action))
  }

  fun overlay(control: OverlayControl) {
    overlayFlow.tryEmit(OverlayControl.serializer().descriptor.getElementName(control.ordinal))
  }

  fun overlayAction(action: String) {
    overlayFlow.tryEmit(action)
  }

  private const val OVERLAY_BUFFER = 16
}
