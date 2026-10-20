package expo.modules.healthconnect.toothbrush

import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import expo.modules.healthconnect.BluetoothConnectNotAllowed
import expo.modules.healthconnect.CompanionScreenUnavailable
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.relayTarget

object BrushBridge {
  private const val PATH = "/api/toothbrushes/mine"
  private const val PHILIPS_APP = "com.philips.cdp.ohc.tuscany"

  suspend fun fetch(context: Context): List<LinkPlan> {
    val plans = HubClient(relayTarget(context)).get<PhoneBrushes>(PATH).brushes
    BrushStore(context).save(plans)
    return plans
  }

  suspend fun sync(context: Context, serverUrl: String, token: String, enrollment: String): List<Map<String, Any?>> {
    configureServer(context, serverUrl, token, enrollment)
    val plans = fetch(context)
    BrushCompanion.observeAll(context)
    if (plans.none { it.holder }) {
      BrushService.send(context, BrushService.ACTION_STOP)
    }
    return status(context)
  }

  fun start(context: Context) {
    if (!BrushPermissions.connectAllowed(context)) throw BluetoothConnectNotAllowed()
    if (BrushStore(context).holding().isEmpty()) return
    BrushCompanion.observeAll(context)
    BrushService.send(context, BrushService.ACTION_CONNECT)
  }

  fun refresh(context: Context) {
    val store = BrushStore(context)
    if (store.plans().isEmpty() && !store.resyncPending() || !BrushPermissions.connectAllowed(context)) return
    BrushService.send(context, BrushService.ACTION_REFRESH)
  }

  fun status(context: Context): List<Map<String, Any?>> =
    BrushStore(context).plans().map { plan ->
      mapOf(
        "deviceId" to plan.deviceId,
        "address" to plan.address,
        "brand" to plan.brand,
        "transport" to plan.transport,
        "holder" to plan.holder,
        "associated" to BrushCompanion.associated(context, plan.address),
        "permission" to BrushPermissions.connectAllowed(context)
      )
    }

  suspend fun associate(activity: Activity?, context: Context, stack: String): String =
    BrushCompanion.associate(activity ?: throw CompanionScreenUnavailable(), stack).also {
      BrushCompanion.observeAll(context)
    }

  fun philipsAppInstalled(context: Context): Boolean = try {
    context.packageManager.getPackageInfo(PHILIPS_APP, 0)
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }
}

object BrushPermissions {
  fun connectAllowed(context: Context): Boolean =
    android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S ||
      context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

  fun scanAllowed(context: Context): Boolean =
    android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S ||
      context.checkSelfPermission(android.Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
}
