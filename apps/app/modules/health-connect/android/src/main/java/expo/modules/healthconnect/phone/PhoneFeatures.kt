package expo.modules.healthconnect.phone

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

sealed class FeatureState {
  data object Ready : FeatureState()

  class NeedsPermission(val permission: String, val reason: String) : FeatureState()

  class Unsupported(val reason: String) : FeatureState()
}

object PhoneFeatures {
  fun phoneStateAllowed(context: Context): Boolean =
    context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY) &&
      context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

  fun read(context: Context): JSONArray = JSONArray(
    listOf(
      "usage" to usage(context),
      "notifications" to notifications(context),
      "dnd" to dnd(context),
      "write_settings" to writeSettings(context),
      "overlay" to overlay(context),
      "bluetooth" to bluetooth(context),
      "location" to location(context),
      "activity" to activity(context),
      "telephony" to telephony(context),
      "torch" to torch(context),
      "torch_strength" to torchStrength(context),
      "fold" to fold(context)
    ).map { (feature, state) -> json(feature, state) }
  )

  fun json(feature: String, state: FeatureState): JSONObject {
    val body = JSONObject().put("feature", feature)
    return when (state) {
      FeatureState.Ready -> body.put("state", "ready")
      is FeatureState.NeedsPermission -> body.put("state", "needs_permission").put("permission", state.permission).put("reason", state.reason)
      is FeatureState.Unsupported -> body.put("state", "unsupported").put("reason", state.reason)
    }
  }

  private fun need(allowed: Boolean, permission: String, reason: String): FeatureState =
    if (allowed) FeatureState.Ready else FeatureState.NeedsPermission(permission, reason)

  private fun usage(context: Context) = need(
    PhoneReadings.usageAllowed(context),
    "android_usage_access",
    "Usage access is off, so screen time, data use, storage use and app use cannot be read"
  )

  private fun notifications(context: Context) = need(
    PhonePermissions.notificationAccess(context),
    "android_notification_listener",
    "Notification access is off, so notifications and now playing cannot be read"
  )

  private fun dnd(context: Context) = need(
    PhonePermissions.dndAccess(context),
    "android_dnd",
    "Do Not Disturb access is off, so Silent and Do Not Disturb cannot be changed"
  )

  private fun writeSettings(context: Context) = need(
    Settings.System.canWrite(context),
    "android_write_settings",
    "Modify system settings is off, so brightness and screen timeout cannot be changed"
  )

  private fun overlay(context: Context) = need(
    Settings.canDrawOverlays(context),
    "android_overlay",
    "Display over other apps is off, so apps open with a notification tap instead"
  )

  private fun bluetooth(context: Context): FeatureState = when {
    !context.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH) -> FeatureState.Unsupported("This phone has no Bluetooth")
    else -> need(
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        context.checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED,
      "android_bluetooth",
      "Nearby devices access is off, so connected Bluetooth devices cannot be listed"
    )
  }

  private fun location(context: Context) = need(
    PhonePermissions.location(context),
    "android_location",
    "Location access is off, so the Wi-Fi name and places cannot be read"
  )

  private fun activity(context: Context) = need(
    PhonePermissions.activity(context),
    "android_activity_recognition",
    "Physical activity access is off, so walking, running and driving cannot be told apart"
  )

  private fun telephony(context: Context): FeatureState = when {
    !context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY) -> FeatureState.Unsupported("This phone has no mobile radio")
    else -> need(phoneStateAllowed(context), "android_phone_state", "Phone state access is off, so mobile network and calls cannot be read")
  }

  private fun torch(context: Context): FeatureState =
    if (context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH)) FeatureState.Ready else FeatureState.Unsupported("This phone has no flashlight")

  private fun torchStrength(context: Context): FeatureState = when {
    torch(context) is FeatureState.Unsupported -> FeatureState.Unsupported("This phone has no flashlight")
    Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU -> FeatureState.Unsupported("Flashlight brightness needs Android 13 or newer")
    strongestTorch(context) > 1 -> FeatureState.Ready
    else -> FeatureState.Unsupported("This flashlight has a single brightness")
  }

  private fun strongestTorch(context: Context): Int {
    val cameras = context.getSystemService(CameraManager::class.java)
    return cameras.cameraIdList.maxOfOrNull {
      cameras.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL) ?: 1
    } ?: 1
  }

  private fun fold(context: Context): FeatureState =
    if (PhoneScreen.foldable(context)) FeatureState.Ready else FeatureState.Unsupported("This phone does not fold")
}
