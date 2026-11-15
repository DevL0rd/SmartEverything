package expo.modules.healthconnect.planner

import android.Manifest
import android.content.Context
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

class PlannerModule : Module() {
  private var forwarding: Job? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Planner")

    Events(EVENT)

    OnStartObserving(EVENT) {
      forwarding = appContext.backgroundCoroutineScope.launch {
        PlannerEvents.events.collect { sendEvent(EVENT, it) }
      }
    }

    OnStopObserving(EVENT) {
      forwarding?.cancel()
      forwarding = null
    }

    AsyncFunction("installPhoneRings") { setJson: String, clientId: String ->
      val set = RingSet.parse(setJson)
      AlarmScheduler.of(context).install(set, clientId)
      BedtimeQuiet.of(context).install(set.bedtimeWindows)
      RingFiles.enqueue(context)
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

    AsyncFunction("ringStatus") { ringKey: String ->
      val ring = AlarmScheduler.of(context).ringOf(RingKeys.baseOf(ringKey))
      val playback = RingingNow.playbackOf(RingKeys.baseOf(ringKey))
      (playback ?: RingPlayback.PENDING).toMap(ringKey, ring?.let { AlarmScheduler.of(context).snoozesLeft(it) }) +
        mapOf("ringing" to (playback != null))
    }

    stepFunctions()

    sleepFunctions()

    systemFunctions()
  }

  private fun ModuleDefinitionBuilder.stepFunctions() {
    AsyncFunction("stepCounterAvailable") { StepCounter.available(context) }

    AsyncFunction("stepCounterPermitted") { StepCounter.permitted(context) }

    AsyncFunction("requestStepCounterPermission") Coroutine { -> askForSteps() }

    AsyncFunction("startStepCount") { StepCounter.start(context) }

    AsyncFunction("stopStepCount") { StepCounter.stop() }
  }

  private fun ModuleDefinitionBuilder.sleepFunctions() {
    AsyncFunction("startSleepSound") { requestJson: String -> SleepSounds.start(context, requestJson) }

    AsyncFunction("stopSleepSound") { SleepSounds.stop(context) }

    AsyncFunction("sleepSoundState") { SleepSoundNow.toMap() }
  }

  private fun ModuleDefinitionBuilder.systemFunctions() {
    AsyncFunction("notificationPolicyAllowed") { PlannerSystem.notificationPolicyAllowed(context) }

    AsyncFunction("openNotificationPolicySettings") { PlannerSystem.openNotificationPolicySettings(context) }

    AsyncFunction("fullScreenAlarmAllowed") { PlannerSystem.fullScreenAlarmAllowed(context) }

    AsyncFunction("openFullScreenAlarmSettings") { PlannerSystem.openFullScreenAlarmSettings(context) }

    AsyncFunction("batteryOptimizationIgnored") { PlannerSystem.batteryOptimizationIgnored(context) }

    AsyncFunction("openBatterySettings") { PlannerSystem.openBatterySettings(context) }

    AsyncFunction("nextSystemAlarm") { PlannerSystem.nextSystemAlarm(context) }
  }

  private suspend fun askForSteps(): Boolean {
    val service: Permissions = appContext.permissions ?: error("the permissions module is unavailable")
    return withContext(Dispatchers.Main) {
      suspendCancellableCoroutine { continuation ->
        service.askForPermissions(
          { result -> continuation.resume(result.values.all { it.status == PermissionsStatus.GRANTED }) },
          Manifest.permission.ACTIVITY_RECOGNITION
        )
      }
    }
  }

  private companion object {
    const val EVENT = "onPlannerEvent"
  }
}
