package expo.modules.healthconnect.toothbrush

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BrushModule : Module() {
  private var scan: BrushScan? = null

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Toothbrush")

    Events(CANDIDATE_EVENT)

    OnDestroy {
      scan?.stop()
      scan = null
    }

    AsyncFunction("startBrushScan") { brands: List<String> ->
      scan?.stop()
      scan = BrushScan(context(), brands.toSet()) { sendEvent(CANDIDATE_EVENT, it.toMap()) }.also { it.start() }
    }

    AsyncFunction("stopBrushScan") {
      scan?.stop()
      scan = null
    }

    AsyncFunction("associateBrush") Coroutine { stack: String ->
      BrushBridge.associate(appContext.currentActivity, context(), stack)
    }

    AsyncFunction("bondBrush") Coroutine { address: String ->
      BrushBond.bond(context(), address.uppercase())
    }

    AsyncFunction("brushBonded") { address: String ->
      BrushBond.bonded(context(), address.uppercase())
    }

    AsyncFunction("dumpBrush") Coroutine { address: String, name: String, brand: String ->
      BrushDumper(context()).dump(address.uppercase(), name, brand)
    }

    AsyncFunction("syncBrushes") Coroutine { serverUrl: String, token: String, enrollment: String ->
      BrushBridge.sync(context(), serverUrl, token, enrollment)
    }

    AsyncFunction("startBrushes") {
      BrushBridge.start(context())
    }

    AsyncFunction("refreshBrushes") {
      BrushBridge.refresh(context())
    }

    AsyncFunction("brushStatus") {
      BrushBridge.status(context())
    }

    AsyncFunction("brushPermissions") {
      mapOf(
        "scan" to BrushPermissions.scanAllowed(context()),
        "connect" to BrushPermissions.connectAllowed(context()),
        "philipsApp" to BrushBridge.philipsAppInstalled(context())
      )
    }
  }

  private companion object {
    const val CANDIDATE_EVENT = "onBrushCandidate"
  }
}
