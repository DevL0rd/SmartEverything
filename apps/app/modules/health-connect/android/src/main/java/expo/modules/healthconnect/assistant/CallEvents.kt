package expo.modules.healthconnect.assistant

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

  fun control(action: String) {
    flow.tryEmit(AssistantCallEvent.Control(action))
  }
}
