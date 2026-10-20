package expo.modules.healthconnect.treadmill

import android.content.Context
import expo.modules.healthconnect.HubJson
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TreadmillModule : Module() {
  private var scan: TreadmillScan? = null

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Treadmill")

    Events(CANDIDATE_EVENT)

    OnDestroy {
      scan?.stop()
      scan = null
    }

    AsyncFunction("startTreadmillScan") {
      scan?.stop()
      scan = TreadmillScan(context()) { sendEvent(CANDIDATE_EVENT, it.toMap()) }.also { it.start() }
    }

    AsyncFunction("stopTreadmillScan") {
      scan?.stop()
      scan = null
    }

    AsyncFunction("dumpTreadmill") Coroutine { address: String, name: String ->
      HubJson.encode(TreadmillDumper(context()).dump(address.uppercase(), name))
    }

    AsyncFunction("syncTreadmills") Coroutine { serverUrl: String, token: String, enrollment: String ->
      TreadmillBridge.sync(context(), serverUrl, token, enrollment)
    }

    AsyncFunction("startTreadmills") {
      TreadmillBridge.start(context())
    }

    AsyncFunction("refreshTreadmills") {
      TreadmillBridge.refresh(context())
    }

    AsyncFunction("treadmillStatus") {
      TreadmillBridge.status(context())
    }

    AsyncFunction("treadmillPermissions") {
      mapOf(
        "scan" to TreadmillPermissions.scanAllowed(context()),
        "connect" to TreadmillPermissions.connectAllowed(context())
      )
    }

    AsyncFunction("associateTreadmill") Coroutine { address: String ->
      TreadmillBridge.associate(appContext.currentActivity, context(), address)
    }
  }

  private companion object {
    const val CANDIDATE_EVENT = "onTreadmillCandidate"
  }
}
