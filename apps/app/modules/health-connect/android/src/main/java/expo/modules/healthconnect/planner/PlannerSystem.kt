package expo.modules.healthconnect.planner

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import java.time.Instant

object PlannerSystem {
  fun batteryOptimizationIgnored(context: Context): Boolean =
    context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

  fun openBatterySettings(context: Context) {
    context.startActivity(
      Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri(context)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  fun fullScreenAlarmAllowed(context: Context): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE ||
      context.getSystemService(NotificationManager::class.java).canUseFullScreenIntent()

  fun openFullScreenAlarmSettings(context: Context) {
    val action = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT
    } else {
      Settings.ACTION_APPLICATION_DETAILS_SETTINGS
    }
    context.startActivity(Intent(action, packageUri(context)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  fun nextSystemAlarm(context: Context): String? {
    val next = context.getSystemService(AlarmManager::class.java).nextAlarmClock ?: return null
    if (next.showIntent?.creatorPackage == context.packageName) {
      return null
    }
    return Instant.ofEpochMilli(next.triggerTime).toString()
  }

  private fun packageUri(context: Context): Uri = Uri.fromParts("package", context.packageName, null)
}
