package expo.modules.healthconnect.network

import android.app.Activity
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class HubResourceRegistrar(
  private val context: () -> Context,
  private val activity: () -> Activity?,
  private val policy: () -> HubRoutePolicy,
  private val emit: (Map<String, Any>) -> Unit,
) {
  private var broker: HubResourceBroker? = null
  private var download: HubResourceDownload? = null
  private var picker: AppContextActivityResultLauncher<HubResourceSave, Uri?>? = null
  private var permission: AppContextActivityResultLauncher<String, Unit>? = null
  private var initializationFailure: Exception? = null
  @Synchronized private fun ready(): Boolean {
    if (broker != null) return true
    return try {
      HubResourceFiles.clean(context())
      val grants = HubResourceGrants(policy())
      val initialized = try { HubResourceBroker(grants) } catch (failure: Exception) { grants.close(); throw failure }
      broker = initialized
      HubResourceFileProvider.grants = grants
      download = HubResourceDownload(context(), initialized, emit).apply { launcher = picker }
      initializationFailure = null
      true
    } catch (failure: Exception) { initializationFailure = failure; false }
  }
  private fun requireBroker(): HubResourceBroker {
    check(ready()) { "Native resource listener is unavailable: ${initializationFailure?.javaClass?.simpleName}" }
    return broker ?: error("Missing initialized resource listener")
  }
  fun register(builder: ModuleDefinitionBuilder) = with(builder) {
    Function("resourcesReady") { true }
    RegisterActivityContracts {
      picker = registerForActivityResult(HubResourceSaveContract())
      permission = registerForActivityResult(AndroidUpdatePermissionContract())
      download?.launcher = picker
    }
    AsyncFunction("openResource") { json: String ->
      val initialized = requireBroker()
      val grant = initialized.grants.open(json)
      mapOf("id" to grant.id, "localUrl" to initialized.url(grant), "expiresAt" to grant.expiresAt)
    }
    AsyncFunction("releaseResource") { id: String -> broker?.grants?.release(id) }
    AsyncFunction("requestAndroidUpdatePermission") Coroutine { ->
      withContext(Dispatchers.Main) { requestInstallPermission() }
    }
    AsyncFunction("installAndroidUpdate") Coroutine { json: String ->
      requireBroker()
      val downloader = download ?: error("Missing initialized resource downloads")
      downloader.install(json, activity).toMap()
    }
    AsyncFunction("cancelAndroidUpdate") { id: String -> download?.cancelInstall(id) }
    AsyncFunction("downloadResource") Coroutine { json: String ->
      requireBroker()
      val downloader = download ?: error("Missing initialized resource downloads")
      downloader.download(json, activity)
    }
  }
  private suspend fun requestInstallPermission(): Boolean {
    val app = context()
    if (app.packageManager.canRequestPackageInstalls()) return true
    visibleResourceActivity(activity)
    val launcher = permission ?: error("Android's install permission settings are unavailable")
    launcher.launch(app.packageName)
    return app.packageManager.canRequestPackageInstalls()
  }
  fun clear(scope: String) { broker?.grants?.clear(scope) }
  fun close() {
    HubResourceFileProvider.grants = null
    try { broker?.close() } finally {
      broker = null
      download = null
      picker = null
      permission = null
    }
  }
}
