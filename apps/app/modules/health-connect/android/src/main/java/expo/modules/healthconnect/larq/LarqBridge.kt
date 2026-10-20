package expo.modules.healthconnect.larq

import android.content.Context
import expo.modules.healthconnect.BluetoothConnectNotAllowed
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.HubJson
import expo.modules.healthconnect.LarqReadFailed
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.relayTarget
import kotlinx.serialization.Serializable

@Serializable
class BottleReadout(val dis: BottleInformation, val battery: Int?)

object LarqBridge {
  private const val PATH = "/api/bottles/mine"

  suspend fun sync(context: Context, serverUrl: String, token: String, enrollment: String): List<Map<String, Any?>> {
    configureServer(context, serverUrl, token, enrollment)
    val bottles = HubClient(relayTarget(context)).get<PhoneBottles>(PATH).bottles
    LarqStore(context).save(bottles)
    if (LarqPermissions.scanAllowed(context)) LarqScan.register(context, bottles)
    return status(context)
  }

  fun refresh(context: Context) {
    val bottles = LarqStore(context).bottles()
    if (bottles.isNotEmpty() && LarqPermissions.scanAllowed(context)) LarqScan.register(context, bottles)
  }

  fun status(context: Context): List<Map<String, Any?>> =
    LarqStore(context).bottles().map { bottle ->
      mapOf(
        "deviceId" to bottle.deviceId,
        "serial" to bottle.serial,
        "scan" to LarqPermissions.scanAllowed(context),
        "connect" to LarqPermissions.connectAllowed(context)
      )
    }

  suspend fun read(context: Context, address: String): String {
    if (!LarqPermissions.connectAllowed(context)) throw BluetoothConnectNotAllowed()
    val link = LarqGatt(context, address)
    try {
      if (!link.open()) throw LarqReadFailed("it did not accept a connection; tap the cap and try again")
      val information = link.readInformation()
      return HubJson.encode(BottleReadout(information, link.readBattery()))
    } finally {
      link.close()
    }
  }
}
