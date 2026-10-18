package expo.modules.healthconnect.watch

import expo.modules.healthconnect.BluetoothConnectNotAllowed
import expo.modules.healthconnect.CompanionScreenUnavailable
import expo.modules.healthconnect.UnsupportedWatchFamily
import expo.modules.healthconnect.WatchNotConfigured
import android.app.Activity
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.configureServer
import expo.modules.healthconnect.relayTarget

object WatchBridge {
  private const val WATCHES_PATH = "/api/watches/mine"

  suspend fun sync(context: Context, serverUrl: String, token: String, enrollment: String): List<Map<String, Any?>> {
    configureServer(context, serverUrl, token, enrollment)
    val watches = HubClient(relayTarget(context)).get<PhoneWatches>(WATCHES_PATH).watches
    val store = WatchStore(context)
    store.save(watches)
    WatchEvents.emit("watches_synced", "${watches.size} watch(es) for this phone's person")
    if (watches.isEmpty()) {
      stop(context)
    }
    return status(context)
  }

  fun start(context: Context) {
    if (!WatchPermissions.connectAllowed(context)) {
      throw BluetoothConnectNotAllowed()
    }
    if (WatchStore(context).active().isEmpty()) {
      return
    }
    WatchCompanion.observeAll(context)
    WatchService.send(context, WatchService.ACTION_CONNECT)
  }

  fun pause(context: Context, deviceId: String, paused: Boolean) {
    WatchStore(context).watches().firstOrNull { it.deviceId == deviceId } ?: throw WatchNotConfigured(deviceId)
    WatchService.send(context, WatchService.ACTION_PAUSE) {
      putExtra(WatchService.EXTRA_DEVICE, deviceId)
      putExtra(WatchService.EXTRA_ON, paused)
    }
  }

  fun live(context: Context, on: Boolean) = sendWhenActive(context, WatchService.ACTION_LIVE) { putExtra(WatchService.EXTRA_ON, on) }

  fun refresh(context: Context) = sendWhenActive(context, WatchService.ACTION_REFRESH) {}

  fun syncNow(context: Context) = sendWhenActive(context, WatchService.ACTION_SYNC) {}

  fun status(context: Context): List<Map<String, Any?>> {
    val store = WatchStore(context)
    return store.watches().map { watch ->
      WatchSnapshots.of(watch).toMap() + mapOf(
        "address" to watch.address,
        "family" to watch.family,
        "model" to watch.model,
        "paused" to store.paused(watch.deviceId),
        "associated" to WatchCompanion.associated(context, watch.address),
        "permission" to WatchPermissions.connectAllowed(context),
        "vendorApps" to VendorApps.status(context, WatchFamilies.named(watch.family).vendorApps)
      )
    }
  }

  suspend fun associate(activity: Activity?, context: Context, deviceId: String): String {
    val watch = WatchStore(context).watches().firstOrNull { it.deviceId == deviceId } ?: throw WatchNotConfigured(deviceId)
    val result = WatchCompanion.associate(activity ?: throw CompanionScreenUnavailable(), watch.address)
    WatchEvents.emit("companion", "${watch.name}: $result", mapOf("deviceId" to deviceId))
    return result
  }

  private fun stop(context: Context) {
    context.stopService(Intent(context, WatchService::class.java))
  }

  private fun sendWhenActive(context: Context, action: String, extras: Intent.() -> Unit) {
    if (WatchStore(context).active().isEmpty() || !WatchPermissions.connectAllowed(context)) {
      return
    }
    try {
      WatchService.send(context, action, extras)
    } catch (failure: IllegalStateException) {
      WatchEvents.emit("service_refused", "Android did not let the watch service start now: ${failure.message}")
    }
  }
}
