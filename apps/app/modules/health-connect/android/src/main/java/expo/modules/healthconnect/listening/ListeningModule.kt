package expo.modules.healthconnect.listening

import android.content.Context
import android.util.Base64
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.configureServer
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class ListeningModule : Module() {
  private var stateJob: Job? = null
  private var wakeJob: Job? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Listening")

    Events(STATE_EVENT, WAKE_EVENT)

    observing()
    controls()
  }

  private fun ModuleDefinitionBuilder.observing() {
    OnStartObserving(STATE_EVENT) {
      stateJob = appContext.backgroundCoroutineScope.launch {
        ListeningEvents.state.collect { sendEvent(STATE_EVENT, stateMap(it)) }
      }
    }

    OnStopObserving(STATE_EVENT) {
      stateJob?.cancel()
      stateJob = null
    }

    OnStartObserving(WAKE_EVENT) {
      wakeJob = appContext.backgroundCoroutineScope.launch {
        ListeningEvents.wakes.collect { sendEvent(WAKE_EVENT, wakeMap(it)) }
      }
    }

    OnStopObserving(WAKE_EVENT) {
      wakeJob?.cancel()
      wakeJob = null
    }
  }

  private fun ModuleDefinitionBuilder.controls() {
    AsyncFunction("configureListening") { serverUrl: String, token: String, enrollment: String, configJson: String ->
      configureServer(context, serverUrl, token, enrollment)
      ListeningService.configure(context, HubJson.decode<ListeningConfig>(configJson))
    }

    AsyncFunction("restListening") { reason: String ->
      ListeningService.rest(context, reason)
    }

    AsyncFunction("resumeListening") {
      WakeReplay.release()
      ListeningService.resume(context)
    }

    AsyncFunction("stopListening") {
      WakeReplay.release()
      ListeningService.stop(context)
    }

    AsyncFunction("releaseWake") {
      WakeReplay.release()
    }

    AsyncFunction("watchListeningLevel") { on: Boolean ->
      ListeningEvents.levelsWatched = on
    }

    AsyncFunction("setHomeNetwork") { atHome: Boolean ->
      HomeNetwork.set(atHome)
    }

    AsyncFunction("listeningCounters") {
      ListeningCounters.shared.snapshot()
    }
  }

  companion object {
    const val STATE_EVENT = "onListeningState"
    const val WAKE_EVENT = "onListeningWake"

    fun stateMap(state: ListeningState): Map<String, Any?> = mapOf(
      "status" to state.status.name.lowercase(),
      "detail" to state.detail,
      "transcribe" to state.transcribe
    )

    fun wakeMap(wake: WakeHeard): Map<String, Any?> = mapOf(
      "phrase" to wake.phrase,
      "snippetDbfs" to wake.snippetDbfs,
      "preroll" to Base64.encodeToString(HubReports.littleEndian(wake.preroll), Base64.NO_WRAP),
      "atMs" to wake.atMs
    )
  }
}
