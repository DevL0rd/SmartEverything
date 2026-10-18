package expo.modules.healthconnect.listening

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object HomeNetwork {
  private val current = MutableStateFlow(false)

  val reachable: StateFlow<Boolean> = current.asStateFlow()

  fun set(atHome: Boolean) {
    current.value = atHome
  }
}
