package expo.modules.healthconnect.assistant

import android.content.Context
import expo.modules.healthconnect.overlay.OverlayPrefs
import expo.modules.healthconnect.overlay.OverlayStage
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.ModuleDefinitionBuilder

fun ModuleDefinitionBuilder.overlayFunctions(context: () -> Context) {
  Function("overlayStatus") {
    AssistantSetup.status(context())
  }

  AsyncFunction("openOverlaySettings") {
    AssistantSetup.openOverlaySettings(context())
  }

  AsyncFunction("openAssistantSettings") {
    AssistantSetup.openAssistantSettings(context())
  }

  AsyncFunction("setOverlayPrefs") { json: String ->
    OverlayStage.ensure(context())
    OverlayStage.prefs(OverlayPrefs.save(context(), json))
  }

  AsyncFunction("resetOverlayPosition") {
    OverlayStage.ensure(context())
    OverlayStage.resetPosition()
  }

  AsyncFunction("showAssistantSession") {
    AssistantInteractionService.showForWake(context())
  }.runOnQueue(Queues.MAIN)

  AsyncFunction("setOverlayCallPage") { onCallPage: Boolean ->
    OverlayStage.callPage(onCallPage)
  }
}
