package expo.modules.healthconnect.watch

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

object WatchPermissions {
  fun connectAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
      context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
}
