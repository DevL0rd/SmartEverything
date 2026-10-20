package expo.modules.healthconnect.larq

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LarqModule : Module() {
  private var scan: LarqSetupScan? = null

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Larq")

    Events(CANDIDATE_EVENT)

    OnDestroy {
      scan?.stop()
      scan = null
    }

    AsyncFunction("startLarqScan") {
      scan?.stop()
      scan = LarqSetupScan(context()) { sendEvent(CANDIDATE_EVENT, it.toMap()) }.also { it.start() }
    }

    AsyncFunction("stopLarqScan") {
      scan?.stop()
      scan = null
    }

    AsyncFunction("readLarq") Coroutine { address: String ->
      LarqBridge.read(context(), address.uppercase())
    }

    AsyncFunction("syncBottles") Coroutine { serverUrl: String, token: String, enrollment: String ->
      LarqBridge.sync(context(), serverUrl, token, enrollment)
    }

    AsyncFunction("refreshBottles") {
      LarqBridge.refresh(context())
    }

    AsyncFunction("bottleStatus") {
      LarqBridge.status(context())
    }

    AsyncFunction("bottlePermissions") {
      mapOf(
        "scan" to LarqPermissions.scanAllowed(context()),
        "connect" to LarqPermissions.connectAllowed(context())
      )
    }
  }

  private companion object {
    const val CANDIDATE_EVENT = "onLarqCandidate"
  }
}
