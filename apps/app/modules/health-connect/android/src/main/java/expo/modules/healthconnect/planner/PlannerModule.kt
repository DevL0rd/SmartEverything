package expo.modules.healthconnect.planner

import android.content.Context
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PlannerModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Planner")

    AsyncFunction("installPhoneRings") { setJson: String, clientId: String ->
      AlarmScheduler.of(context).install(RingSet.parse(setJson), clientId)
    }

    AsyncFunction("snoozeRing") { ringKey: String, minutes: Int? ->
      RingControl.snooze(context, ringKey, minutes)
    }

    AsyncFunction("dismissRing") { ringKey: String ->
      RingControl.stop(context, ringKey)
    }

    AsyncFunction("stopRing") { ringKey: String ->
      RingControl.stop(context, ringKey)
    }

    AsyncFunction("ringingRings") { RingingNow.keys() }

    AsyncFunction("fullScreenAlarmAllowed") { PlannerSystem.fullScreenAlarmAllowed(context) }

    AsyncFunction("openFullScreenAlarmSettings") { PlannerSystem.openFullScreenAlarmSettings(context) }

    AsyncFunction("batteryOptimizationIgnored") { PlannerSystem.batteryOptimizationIgnored(context) }

    AsyncFunction("openBatterySettings") { PlannerSystem.openBatterySettings(context) }

    AsyncFunction("nextSystemAlarm") { PlannerSystem.nextSystemAlarm(context) }
  }
}
