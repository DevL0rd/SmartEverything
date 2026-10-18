package expo.modules.healthconnect

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts.RequestMultiplePermissions
import androidx.health.connect.client.PermissionController
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import java.io.Serializable
import kotlin.coroutines.CoroutineContext
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

class PermissionSet(val permissions: ArrayList<String>) : Serializable

class PermissionContract : AppContextActivityResultContract<PermissionSet, Set<String>> {
  private val delegate = PermissionController.createRequestPermissionResultContract()

  override fun createIntent(context: Context, input: PermissionSet): Intent =
    delegate.createIntent(context, input.permissions.toSet())

  override fun parseResult(input: PermissionSet, resultCode: Int, intent: Intent?): Set<String> =
    delegate.parseResult(resultCode, intent)
}

enum class PermissionRoute(val label: String) {
  RUNTIME("runtime"),
  ACTIVITY_RESULT("activity_result");

  companion object {
    fun of(action: String?): PermissionRoute =
      if (action == RequestMultiplePermissions.ACTION_REQUEST_PERMISSIONS) RUNTIME else ACTIVITY_RESULT
  }
}

object DeclaredPermissions {
  fun missing(wanted: Set<String>, declared: Collection<String>): Set<String> = wanted - declared.toSet()

  fun of(context: Context): Set<String> = context.packageManager
    .getPackageInfo(context.packageName, PackageManager.GET_PERMISSIONS)
    .requestedPermissions
    ?.toSet()
    .orEmpty()
}

class HealthPermissionsUndeclared(missing: Set<String>) : SyncFailure(
  "This app build does not declare ${missing.size} Health Connect permission(s) it asks for, so " +
    "Health Connect will not show its permission screen; install a build made from the current " +
    "config: ${missing.sorted().joinToString()}",
  retryable = false
)

fun platformRoute(activity: Context, permissions: Set<String>): PermissionRoute =
  PermissionRoute.of(PermissionContract().createIntent(activity, PermissionSet(ArrayList(permissions))).action)

class HealthPermissionRequester(
  private val appContext: AppContext,
  private val main: CoroutineContext = Dispatchers.Main,
  private val routeOf: (Context, Set<String>) -> PermissionRoute = ::platformRoute
) {
  var launcher: AppContextActivityResultLauncher<PermissionSet, Set<String>>? = null

  suspend fun request(context: Context, permissions: Set<String>) {
    val missing = DeclaredPermissions.missing(permissions, DeclaredPermissions.of(context))
    if (missing.isNotEmpty()) {
      throw HealthPermissionsUndeclared(missing)
    }
    val activity = appContext.currentActivity ?: throw PermissionScreenUnavailable()
    val route = routeOf(activity, permissions)
    NativeLog.info(SCOPE, "permissions.requested") {
      mapOf("route" to route.label, "requested" to permissions.size)
    }
    when (route) {
      PermissionRoute.RUNTIME -> askRuntime(permissions)
      PermissionRoute.ACTIVITY_RESULT -> launchScreen(permissions)
    }
  }

  private suspend fun askRuntime(permissions: Set<String>) {
    val service: Permissions = appContext.permissions ?: throw PermissionScreenUnavailable()
    val granted = withContext(main) {
      suspendCancellableCoroutine { continuation ->
        service.askForPermissions(
          { result -> continuation.resume(result.count { it.value.status == PermissionsStatus.GRANTED }) },
          *permissions.toTypedArray()
        )
      }
    }
    NativeLog.info(SCOPE, "permissions.answered") {
      mapOf("route" to PermissionRoute.RUNTIME.label, "requested" to permissions.size, "granted" to granted)
    }
  }

  private suspend fun launchScreen(permissions: Set<String>) {
    val screen = launcher ?: throw PermissionScreenUnavailable()
    val granted = withContext(main) { screen.launch(PermissionSet(ArrayList(permissions))) }
    NativeLog.info(SCOPE, "permissions.answered") {
      mapOf("route" to PermissionRoute.ACTIVITY_RESULT.label, "requested" to permissions.size, "granted" to granted.size)
    }
  }

  private companion object {
    const val SCOPE = "health-permissions"
  }
}
