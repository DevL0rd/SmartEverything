package expo.modules.healthconnect.treadmill

import android.app.Activity
import android.content.Context
import expo.modules.healthconnect.BluetoothConnectNotAllowed
import expo.modules.healthconnect.CompanionScreenUnavailable
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.relayTarget

object TreadmillBridge {
  private const val PATH = "/api/treadmills/mine"

  suspend fun fetch(context: Context): List<LinkPlan> {
    val plans = HubClient(relayTarget(context)).get<PhoneTreadmills>(PATH).treadmills
    TreadmillStore(context).save(plans)
    return plans
  }

  suspend fun sync(context: Context, serverUrl: String, token: String, enrollment: String): List<Map<String, Any?>> {
    configureServer(context, serverUrl, token, enrollment)
    val plans = fetch(context)
    TreadmillCompanion.observeAll(context)
    if (plans.none { it.holder }) {
      TreadmillService.send(context, TreadmillService.ACTION_STOP)
    } else if (TreadmillPermissions.connectAllowed(context)) {
      TreadmillService.send(context, TreadmillService.ACTION_CONNECT)
    }
    return status(context)
  }

  fun start(context: Context) {
    if (!TreadmillPermissions.connectAllowed(context)) throw BluetoothConnectNotAllowed()
    if (TreadmillStore(context).holding().isEmpty()) return
    TreadmillCompanion.observeAll(context)
    TreadmillService.send(context, TreadmillService.ACTION_CONNECT)
  }

  fun refresh(context: Context) {
    if (TreadmillStore(context).plans().isEmpty() || !TreadmillPermissions.connectAllowed(context)) return
    TreadmillService.send(context, TreadmillService.ACTION_REFRESH)
  }

  fun status(context: Context): List<Map<String, Any?>> =
    TreadmillStore(context).plans().map { plan ->
      mapOf(
        "deviceId" to plan.deviceId,
        "address" to plan.address,
        "family" to plan.family,
        "holder" to plan.holder,
        "associated" to TreadmillCompanion.associated(context, plan.address),
        "permission" to TreadmillPermissions.connectAllowed(context)
      )
    }

  suspend fun associate(activity: Activity?, context: Context, address: String): String =
    TreadmillCompanion.associate(activity ?: throw CompanionScreenUnavailable(), address.uppercase()).also {
      TreadmillCompanion.observeAddress(context, address.uppercase())
    }
}

object TreadmillPermissions {
  fun connectAllowed(context: Context): Boolean =
    android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S ||
      context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) == android.content.pm.PackageManager.PERMISSION_GRANTED

  fun scanAllowed(context: Context): Boolean =
    android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S ||
      context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == android.content.pm.PackageManager.PERMISSION_GRANTED
}
