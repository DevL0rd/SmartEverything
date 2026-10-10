package expo.modules.healthconnect.phone

import android.Manifest
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.healthconnect.watch.WatchNotificationListener

object PhonePermissions {
  private const val LEGACY_ACTIVITY = "com.google.android.gms.permission.ACTIVITY_RECOGNITION"

  fun activity(context: Context): Boolean = granted(
    context,
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) Manifest.permission.ACTIVITY_RECOGNITION else LEGACY_ACTIVITY
  )

  fun location(context: Context): Boolean = granted(context, Manifest.permission.ACCESS_FINE_LOCATION)

  fun backgroundLocation(context: Context): Boolean =
    location(context) &&
      (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION))

  fun notificationAccess(context: Context): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
    val me = ComponentName(context, WatchNotificationListener::class.java).flattenToString()
    return enabled.split(':').contains(me)
  }

  fun dndAccess(context: Context): Boolean =
    context.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted

  fun batteryUnrestricted(context: Context): Boolean =
    context.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(context.packageName)

  fun all(context: Context): Map<String, Any?> = mapOf(
    "activity" to activity(context),
    "location" to location(context),
    "backgroundLocation" to backgroundLocation(context),
    "notificationAccess" to notificationAccess(context),
    "dndAccess" to dndAccess(context),
    "usageAccess" to PhoneReadings.usageAllowed(context),
    "batteryUnrestricted" to batteryUnrestricted(context)
  )

  private fun granted(context: Context, permission: String): Boolean =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
}
