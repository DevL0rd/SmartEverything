package expo.modules.healthconnect.phone

import android.annotation.SuppressLint
import android.app.Activity
import android.bluetooth.BluetoothManager
import android.content.Context
import expo.modules.healthconnect.watch.WatchCompanion
import expo.modules.healthconnect.watch.WatchStore

object PhoneCar {
  @SuppressLint("MissingPermission")
  fun bonded(context: Context): List<Map<String, Any?>> {
    val adapter = context.getSystemService(BluetoothManager::class.java).adapter ?: return emptyList()
    val watches = WatchStore(context)
    return adapter.bondedDevices.orEmpty()
      .filter { watches.byAddress(it.address.uppercase()) == null }
      .map { mapOf("name" to (it.name ?: it.address), "address" to it.address.uppercase()) }
  }

  suspend fun choose(activity: Activity, address: String): String {
    val outcome = WatchCompanion.associate(activity, address)
    if (outcome == "created" || outcome == "already") {
      PhoneStore(activity).setCar(address.uppercase())
      PhoneStore(activity).setSensor(PhoneSensor.CAR, true)
    }
    return outcome
  }

  fun forget(context: Context) {
    PhoneStore(context).setCar(null)
    PhoneStore(context).setSensor(PhoneSensor.CAR, false)
  }

  fun observe(context: Context) {
    val car = PhoneStore(context).car() ?: return
    WatchCompanion.observeAddress(context, car)
  }

  fun isCar(context: Context, address: String): Boolean = PhoneStore(context).car().equals(address, ignoreCase = true)

  fun presence(context: Context, address: String, connected: Boolean) {
    if (!isCar(context, address) || !PhoneStore(context).sensor(PhoneSensor.CAR)) {
      return
    }
    PhoneContextInputs.feed(context, ContextInput.Car(connected))
  }
}
