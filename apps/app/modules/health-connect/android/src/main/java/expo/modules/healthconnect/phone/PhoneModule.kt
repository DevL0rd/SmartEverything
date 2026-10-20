package expo.modules.healthconnect.phone

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.CompanionScreenUnavailable
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class PhoneModule : Module() {
  private var forwarding: Job? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Phone")

    Events(EVENT)

    OnStartObserving(EVENT) {
      forwarding = appContext.backgroundCoroutineScope.launch {
        PhoneEvents.events.collect { sendEvent(EVENT, it) }
      }
    }

    OnStopObserving(EVENT) {
      forwarding?.cancel()
      forwarding = null
    }

    AsyncFunction("startPhoneNode") { serverUrl: String, token: String, enrollment: String ->
      configureServer(context, serverUrl, token, enrollment)
      PhoneNode.start(context)
    }

    AsyncFunction("stopPhoneNode") { PhoneNode.stop(context) }

    AsyncFunction("phoneStatus") { PhoneNode.status(context) }

    AsyncFunction("setPhoneSensor") { sensor: String, on: Boolean ->
      PhoneStore(context).setSensor(PhoneSensor.of(sensor), on)
      PhoneNode.watch(context)
      PhoneNode.status(context)
    }

    AsyncFunction("phoneCarCandidates") { PhoneCar.bonded(context) }

    AsyncFunction("choosePhoneCar") Coroutine { address: String ->
      PhoneCar.choose(appContext.currentActivity ?: throw CompanionScreenUnavailable(), address)
    }

    AsyncFunction("forgetPhoneCar") { PhoneCar.forget(context) }

    AsyncFunction("setHomeWifi") { useCurrent: Boolean ->
      PhoneStore(context).setHomeWifi(if (useCurrent) PhoneNetwork.currentSsid(context) else null)
      PhoneNode.status(context)
    }

    AsyncFunction("phonePlaces") { PhonePlaces(context).all().map { it.toMap() } }

    AsyncFunction("savePhonePlace") { id: String?, name: String, latitude: Double, longitude: Double, radiusMeters: Double ->
      PhonePlaces(context).save(id, name, latitude, longitude, radiusMeters.toFloat()).toMap()
    }

    AsyncFunction("removePhonePlace") { id: String -> PhonePlaces(context).remove(id) }

    AsyncFunction("parkedSpot") { PhoneParking.read(context)?.toMap() }

    AsyncFunction("openUsageAccess") { open(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }

    AsyncFunction("openAccessibilitySettings") { open(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }

    AsyncFunction("openWriteSettings") { openForApp(Settings.ACTION_MANAGE_WRITE_SETTINGS) }

    AsyncFunction("openBatteryOptimization") { openForApp(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) }
  }

  private fun openForApp(action: String) = open(Intent(action, Uri.parse("package:${context.packageName}")))

  private fun open(intent: Intent) {
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  private companion object {
    const val EVENT = "onPhoneEvent"
  }
}
