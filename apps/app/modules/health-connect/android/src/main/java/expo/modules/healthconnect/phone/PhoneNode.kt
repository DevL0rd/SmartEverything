package expo.modules.healthconnect.phone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

object PhoneNode {
  fun start(context: Context) {
    PhoneStore(context).setEnabled(true)
    watch(context)
    PhoneReporter.report(context, full = true)
  }

  fun stop(context: Context) {
    PhoneStore(context).setEnabled(false)
    PhoneActivity.register(context)
    PhoneGeofences.stop(context)
    PhoneNetwork.stop(context)
    PhoneReporter.forget(context)
  }

  fun watch(context: Context) {
    if (!PhoneStore(context).enabled()) {
      return
    }
    PhoneNetwork.register(context)
    PhoneActivity.register(context)
    PhoneGeofences.register(context)
    PhoneCar.observe(context)
  }

  fun status(context: Context): Map<String, Any?> {
    val store = PhoneStore(context)
    return mapOf(
      "enabled" to store.enabled(),
      "sensors" to PhoneSensor.entries.associate { it.wire to store.sensor(it) },
      "permissions" to PhonePermissions.all(context),
      "context" to store.context().toMap(),
      "car" to store.car()?.let { car -> PhoneCar.bonded(context).firstOrNull { it["address"] == car } ?: mapOf("name" to car, "address" to car) },
      "carSupported" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU),
      "homeWifi" to store.homeWifi(),
      "currentWifi" to PhoneNetwork.currentSsid(context)
    )
  }
}

class PhoneBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
      PhoneNode.watch(context)
    }
  }
}
