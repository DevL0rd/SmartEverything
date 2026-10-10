package expo.modules.healthconnect.watch

import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.companion.DevicePresenceEvent
import android.os.Build
import androidx.annotation.RequiresApi
import expo.modules.healthconnect.phone.PhoneCar

@RequiresApi(Build.VERSION_CODES.S)
class WatchPresenceService : CompanionDeviceService() {
  @Deprecated("Replaced by onDevicePresenceEvent on Android 16")
  override fun onDeviceAppeared(address: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      appeared(address.uppercase(), "appeared")
    }
  }

  @Deprecated("Replaced by onDevicePresenceEvent on Android 16")
  override fun onDeviceDisappeared(address: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      PhoneCar.presence(this, address.uppercase(), false)
    }
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  @Deprecated("Replaced by onDevicePresenceEvent on Android 16")
  override fun onDeviceAppeared(associationInfo: AssociationInfo) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA) {
      associationInfo.deviceMacAddress?.let { appeared(it.toString().uppercase(), "appeared") }
    }
  }

  @RequiresApi(Build.VERSION_CODES.TIRAMISU)
  @Deprecated("Replaced by onDevicePresenceEvent on Android 16")
  override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.BAKLAVA) {
      associationInfo.deviceMacAddress?.let { PhoneCar.presence(this, it.toString().uppercase(), false) }
    }
  }

  @RequiresApi(Build.VERSION_CODES.BAKLAVA)
  override fun onDevicePresenceEvent(event: DevicePresenceEvent) {
    val address = WatchCompanion.addressOf(this, event.associationId)
    when (event.event) {
      DevicePresenceEvent.EVENT_BLE_APPEARED, DevicePresenceEvent.EVENT_BT_CONNECTED ->
        address?.let { appeared(it, "presence event ${event.event}") }
      else -> left(address, event)
    }
  }

  @RequiresApi(Build.VERSION_CODES.BAKLAVA)
  private fun left(address: String?, event: DevicePresenceEvent) {
    val gone = event.event == DevicePresenceEvent.EVENT_BLE_DISAPPEARED || event.event == DevicePresenceEvent.EVENT_BT_DISCONNECTED
    if (gone && address != null && PhoneCar.isCar(this, address)) {
      PhoneCar.presence(this, address, false)
      return
    }
    WatchEvents.emit("presence", "event ${event.event} for association ${event.associationId}")
  }

  private fun appeared(address: String, how: String) {
    if (PhoneCar.isCar(this, address)) {
      PhoneCar.presence(this, address, true)
      return
    }
    val watch = WatchStore(this).byAddress(address) ?: return
    WatchEvents.emit("presence", "${watch.name} $how", mapOf("deviceId" to watch.deviceId))
    if (!WatchStore(this).paused(watch.deviceId)) {
      WatchService.send(this, WatchService.ACTION_CONNECT) { putExtra(WatchService.EXTRA_ADDRESS, address) }
    }
  }
}
