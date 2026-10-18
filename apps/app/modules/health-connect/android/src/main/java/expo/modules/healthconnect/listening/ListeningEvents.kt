package expo.modules.healthconnect.listening

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow

enum class ListeningStatus { Off, Listening, Resting, Unavailable }

data class ListeningState(val status: ListeningStatus, val detail: String? = null, val transcribe: Boolean = false)

object ListeningEvents {
  private val current = MutableStateFlow(ListeningState(ListeningStatus.Off))
  private val heard = MutableSharedFlow<WakeHeard>(extraBufferCapacity = WAKE_BUFFER, onBufferOverflow = BufferOverflow.DROP_OLDEST)

  val state: StateFlow<ListeningState> = current.asStateFlow()
  val wakes: SharedFlow<WakeHeard> = heard.asSharedFlow()

  fun publish(state: ListeningState) {
    current.value = state
  }

  fun wake(wake: WakeHeard) {
    heard.tryEmit(wake)
  }

  @Volatile
  var levelsWatched = false

  private const val WAKE_BUFFER = 4
}
