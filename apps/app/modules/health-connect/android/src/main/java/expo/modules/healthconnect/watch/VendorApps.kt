package expo.modules.healthconnect.watch

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings

class VendorApp(val packageName: String, val label: String)

enum class VendorState(val label: String, val text: String) {
  ABSENT("absent", "not installed"),
  BLOCKED("blocked", "has no Nearby devices permission, so it cannot take the watch"),
  ALLOWED("allowed", "has the Nearby devices permission, so it can take the watch")
}

object VendorApps {
  private val permission =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_CONNECT else Manifest.permission.BLUETOOTH

  fun stateOf(context: Context, app: VendorApp): VendorState {
    val manager = context.packageManager
    try {
      manager.getApplicationInfo(app.packageName, 0)
    } catch (missing: PackageManager.NameNotFoundException) {
      return VendorState.ABSENT
    }
    val granted = manager.checkPermission(permission, app.packageName) == PackageManager.PERMISSION_GRANTED
    return if (granted) VendorState.ALLOWED else VendorState.BLOCKED
  }

  fun describe(context: Context, apps: List<VendorApp>): String =
    apps.joinToString("; ") { "${it.label} (${it.packageName}) ${stateOf(context, it).text}" }

  fun holding(context: Context, apps: List<VendorApp>): List<VendorApp> =
    apps.filter { stateOf(context, it) == VendorState.ALLOWED }

  fun status(context: Context, apps: List<VendorApp>): List<Map<String, String>> = apps
    .map { it to stateOf(context, it) }
    .filter { it.second != VendorState.ABSENT }
    .map { (app, state) -> mapOf("packageName" to app.packageName, "label" to app.label, "state" to state.label) }

  fun openSettings(context: Context, packageName: String) {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    context.startActivity(intent)
  }
}
