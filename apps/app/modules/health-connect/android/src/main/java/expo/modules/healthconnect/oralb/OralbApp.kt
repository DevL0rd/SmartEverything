package expo.modules.healthconnect.oralb

import android.content.Context
import android.content.pm.PackageManager

object OralbApp {
  const val PACKAGE = "com.pg.oralb.oralbapp"
  const val INSTALLED = "oralb_app=installed"
  const val ABSENT = "oralb_app=absent"

  fun installed(context: Context): Boolean = try {
    context.packageManager.getPackageInfo(PACKAGE, 0)
    true
  } catch (_: PackageManager.NameNotFoundException) {
    false
  }

  fun marker(installed: Boolean): String = if (installed) INSTALLED else ABSENT
}
