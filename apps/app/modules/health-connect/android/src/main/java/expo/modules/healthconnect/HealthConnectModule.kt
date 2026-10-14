package expo.modules.healthconnect

import android.content.Context
import android.content.Intent
import androidx.health.connect.client.PermissionController
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.healthconnect.watch.WatchBridge
import expo.modules.healthconnect.watch.WatchCalendar
import expo.modules.healthconnect.watch.WatchEvents
import expo.modules.healthconnect.watch.WatchFamilies
import expo.modules.healthconnect.watch.NotificationRules
import expo.modules.healthconnect.watch.RelayChange
import expo.modules.healthconnect.watch.VendorApps
import expo.modules.healthconnect.watch.WatchPhoneBridge
import expo.modules.healthconnect.push.PushCommands
import expo.modules.healthconnect.watch.WatchAction
import expo.modules.healthconnect.watch.WatchActions
import expo.modules.healthconnect.watch.WatchRemote
import expo.modules.kotlin.Promise
import expo.modules.healthconnect.watch.WatchHealthWriter
import java.io.Serializable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class PermissionSet(val permissions: ArrayList<String>) : Serializable

class PermissionContract : AppContextActivityResultContract<PermissionSet, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: PermissionSet): Intent =
    delegate.createIntent(context, input.permissions.toSet())

  override fun parseResult(input: PermissionSet, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}

class HealthConnectModule : Module() {
  private var permissionLauncher: AppContextActivityResultLauncher<PermissionSet, Set<String>>? = null
  private var progressForwarding: Job? = null
  private var scaleForwarding: Job? = null
  private var watchForwarding: Job? = null

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("HealthConnect")

    Events(PROGRESS_EVENT, SCALE_EVENT, WATCH_EVENT)

    OnCreate {
      progressForwarding = appContext.backgroundCoroutineScope.launch {
        SyncEvents.progress.collect { sendEvent(PROGRESS_EVENT, it) }
      }
      scaleForwarding = appContext.backgroundCoroutineScope.launch {
        ScaleEvents.events.collect { sendEvent(SCALE_EVENT, it) }
      }
      watchForwarding = appContext.backgroundCoroutineScope.launch {
        WatchEvents.events.collect { sendEvent(WATCH_EVENT, it) }
      }
    }

    OnDestroy {
      progressForwarding?.cancel()
      scaleForwarding?.cancel()
      watchForwarding?.cancel()
    }

    RegisterActivityContracts {
      permissionLauncher = registerForActivityResult(PermissionContract())
    }

    AsyncFunction("getStatus") Coroutine { ->
      HealthConnectAccess.status(context)
    }

    AsyncFunction("requestPermissions") Coroutine { types: List<String>, background: Boolean, history: Boolean ->
      val client = HealthConnectAccess.client(context)
      val wanted = HealthConnectAccess.permissionsFor(
        client,
        types.map(RecordTypes::named),
        background,
        history
      )
      val launcher = permissionLauncher ?: throw PermissionScreenUnavailable()
      withContext(Dispatchers.Main) { launcher.launch(PermissionSet(ArrayList(wanted))) }
      HealthConnectAccess.grants(client).toMap()
    }

    AsyncFunction("requestWritePermissions") Coroutine { ->
      val client = HealthConnectAccess.client(context)
      val launcher = permissionLauncher ?: throw PermissionScreenUnavailable()
      withContext(Dispatchers.Main) {
        launcher.launch(PermissionSet(ArrayList(BodyWriter.writePermissions)))
      }
      BodyWriter.granted(client)
    }

    AsyncFunction("writeGranted") Coroutine { ->
      BodyWriter.granted(HealthConnectAccess.client(context))
    }

    AsyncFunction("healthConnectConfigured") {
      Credentials(context).configured()
    }

    AsyncFunction("deliverBodyReadings") Coroutine { ->
      BodyWriter.deliver(context).toMap()
    }

    AsyncFunction("requestEntryWrites") Coroutine { types: List<String> ->
      val client = HealthConnectAccess.client(context)
      val launcher = permissionLauncher ?: throw PermissionScreenUnavailable()
      withContext(Dispatchers.Main) {
        launcher.launch(PermissionSet(ArrayList(EntryWriter.writePermissions(types))))
      }
      EntryWriter.grantedTypes(client, types)
    }

    AsyncFunction("entryWritesGranted") Coroutine { types: List<String> ->
      EntryWriter.grantedTypes(HealthConnectAccess.client(context), types)
    }

    AsyncFunction("deliverEntries") Coroutine { ->
      EntryWriter.deliver(context).toMap()
    }

    AsyncFunction("configureScaleRelay") { serverUrl: String, token: String, enrollment: String ->
      ScaleRelay(context).configure(serverUrl, token, enrollment)
    }

    AsyncFunction("startScaleRelay") Coroutine { ->
      ScaleRelay(context).start()
    }

    AsyncFunction("stopScaleRelay") {
      ScaleRelay(context).stop()
    }

    AsyncFunction("scaleRelayStatus") {
      ScaleStatus(context).toMap() + ("watching" to ScaleRelay(context).watched().size)
    }

    AsyncFunction("startScaleLiveScan") {
      ScaleRelay(context).startLive()
    }

    AsyncFunction("stopScaleLiveScan") {
      ScaleRelay(context).stopLive()
    }

    AsyncFunction("syncWatches") Coroutine { serverUrl: String, token: String, enrollment: String ->
      WatchBridge.sync(context, serverUrl, token, enrollment)
    }

    AsyncFunction("runPushCommand") { command: String, payloadJson: String ->
      PushCommands.run(context, mapOf(PushCommands.KEY to command, "payload" to payloadJson))
    }

    AsyncFunction("startWatches") {
      WatchBridge.start(context)
    }

    AsyncFunction("pauseWatch") { deviceId: String, paused: Boolean ->
      WatchBridge.pause(context, deviceId, paused)
    }

    AsyncFunction("setWatchLive") { on: Boolean ->
      WatchBridge.live(context, on)
    }

    AsyncFunction("refreshWatches") {
      WatchBridge.refresh(context)
    }

    AsyncFunction("syncWatchNow") {
      WatchBridge.syncNow(context)
    }

    AsyncFunction("requestWatchWrites") Coroutine { ->
      val client = HealthConnectAccess.client(context)
      val launcher = permissionLauncher ?: throw PermissionScreenUnavailable()
      withContext(Dispatchers.Main) {
        launcher.launch(PermissionSet(ArrayList(WatchHealthWriter.writePermissions)))
      }
      WatchHealthWriter.granted(client)
    }

    AsyncFunction("watchWritesGranted") Coroutine { ->
      WatchHealthWriter.granted(HealthConnectAccess.client(context))
    }

    AsyncFunction("watchStatus") {
      WatchBridge.status(context)
    }

    AsyncFunction("associateWatch") Coroutine { deviceId: String ->
      WatchBridge.associate(appContext.currentActivity, context, deviceId)
    }

    AsyncFunction("runWatchAction") { deviceId: String, actionJson: String, promise: Promise ->
      WatchRemote.run(context, deviceId, actionJson) { outcome ->
        promise.resolve(mapOf("ok" to outcome.ok, "detail" to outcome.detail))
      }
    }

    AsyncFunction("setWatchCalendar") { eventsJson: String ->
      WatchCalendar.save(context, eventsJson)
      WatchActions.send(WatchAction.Calendar(WatchCalendar.of(eventsJson)))
    }

    AsyncFunction("findWatch") { deviceId: String, on: Boolean ->
      WatchPhoneBridge.findWatch(context, deviceId, on)
    }

    AsyncFunction("watchRelayStatus") {
      WatchPhoneBridge.relayStatus(context)
    }

    AsyncFunction("setWatchRelay") { change: RelayChange ->
      WatchPhoneBridge.setRelay(context, change)
      WatchPhoneBridge.relayStatus(context)
    }

    AsyncFunction("phoneApps") {
      NotificationRules.installedApps(context)
    }

    AsyncFunction("openNotificationAccess") {
      NotificationRules.openListenerSettings(context)
    }

    AsyncFunction("openDndAccess") {
      WatchPhoneBridge.openDndSettings(context)
    }

    AsyncFunction("openAppSettings") { packageName: String ->
      VendorApps.openSettings(context, packageName)
    }

    AsyncFunction("watchFamilies") {
      WatchFamilies.supported()
    }

    AsyncFunction("grantedPermissions") Coroutine { ->
      HealthConnectAccess.grants(HealthConnectAccess.client(context)).toMap()
    }

    AsyncFunction("configure") { endpoint: String, token: String ->
      Credentials(context).save(IngestTarget(endpoint, token))
    }

    AsyncFunction("syncNow") Coroutine { ->
      SyncEngine(context).run(SyncTrigger.MANUAL).toMap()
    }

    AsyncFunction("schedule") { intervalMinutes: Long ->
      SyncScheduler.schedule(context, intervalMinutes)
    }

    AsyncFunction("cancelSchedule") {
      SyncScheduler.cancel(context)
    }

    AsyncFunction("lastSync") {
      SyncEngine(context).lastReport()?.toMap()
    }
  }

  private companion object {
    const val PROGRESS_EVENT = "onSyncProgress"
    const val SCALE_EVENT = "onScaleEvent"
    const val WATCH_EVENT = "onWatchEvent"
  }
}
