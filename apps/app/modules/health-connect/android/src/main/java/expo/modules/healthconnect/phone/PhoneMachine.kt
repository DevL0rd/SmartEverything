package expo.modules.healthconnect.phone

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

class MachineFacts(
  val sdk: Int,
  val flashlight: Boolean,
  val accessibility: Boolean,
  val overlay: Boolean
)

object PhoneMachine {
  const val ACCESSIBILITY = "android_accessibility"
  const val OVERLAY = "android_overlay"

  fun facts(context: Context) = MachineFacts(
    sdk = Build.VERSION.SDK_INT,
    flashlight = context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH),
    accessibility = PhoneAccessibility.enabled(context),
    overlay = PhonePermissions.overlay(context)
  )

  fun supports(facts: MachineFacts): List<Pair<String, FeatureState>> = listOf(
    "ring" to FeatureState.Ready,
    "stop_ring" to FeatureState.Ready,
    "flashlight" to flashlight(facts),
    "launch_app" to FeatureState.Ready,
    "open" to FeatureState.Ready,
    "screenshot" to accessible(facts, Build.VERSION_CODES.R, "Screenshots need Android 11 or newer", "Screenshots need the SmartEverything accessibility service turned on"),
    "lock" to accessible(facts, Build.VERSION_CODES.P, "Locking needs Android 9 or newer", "Locking needs the SmartEverything accessibility service turned on"),
    "unlock" to FeatureState.Unsupported("Android does not let an app unlock a phone; waking it to its PIN prompt is the closest"),
    "show_unlock" to unlockPrompt(facts),
    "receive_file" to receiveFile(facts)
  )

  fun actions(context: Context): JSONArray = JSONArray(
    supports(facts(context)).map { (action, state) -> json("action", action, state) }
  )

  fun permissions(context: Context): JSONArray = JSONArray(
    states(context).map { (permission, granted) -> JSONObject().put("permission", permission).put("granted", granted) }
  )

  fun json(key: String, name: String, state: FeatureState): JSONObject {
    val body = JSONObject().put(key, name)
    return when (state) {
      FeatureState.Ready -> body.put("state", "ready")
      is FeatureState.NeedsPermission -> body.put("state", "needs_permission").put("permission", state.permission).put("reason", state.reason)
      is FeatureState.Unsupported -> body.put("state", "unsupported").put("reason", state.reason)
    }
  }

  private fun states(context: Context): List<Pair<String, Boolean>> = listOf(
    ACCESSIBILITY to PhoneAccessibility.enabled(context),
    OVERLAY to PhonePermissions.overlay(context),
    "android_dnd" to PhonePermissions.dndAccess(context),
    "android_notification_listener" to PhonePermissions.notificationAccess(context),
    "android_usage_access" to PhoneReadings.usageAllowed(context),
    "android_write_settings" to PhonePermissions.writeSettings(context),
    "android_bluetooth" to PhonePermissions.bluetooth(context),
    "android_location" to PhonePermissions.location(context),
    "android_activity_recognition" to PhonePermissions.activity(context),
    "android_phone_state" to PhoneFeatures.phoneStateAllowed(context)
  )

  private fun receiveFile(facts: MachineFacts): FeatureState =
    if (facts.sdk >= Build.VERSION_CODES.Q) FeatureState.Ready else FeatureState.Unsupported("Receiving files needs Android 10 or newer")

  private fun flashlight(facts: MachineFacts): FeatureState =
    if (facts.flashlight) FeatureState.Ready else FeatureState.Unsupported("This phone has no flashlight")

  private fun accessible(facts: MachineFacts, sdk: Int, tooOld: String, off: String): FeatureState = when {
    facts.sdk < sdk -> FeatureState.Unsupported(tooOld)
    facts.accessibility -> FeatureState.Ready
    else -> FeatureState.NeedsPermission(ACCESSIBILITY, off)
  }

  private fun unlockPrompt(facts: MachineFacts): FeatureState =
    if (facts.overlay) FeatureState.Ready else FeatureState.NeedsPermission(OVERLAY, "Waking the phone to its unlock prompt needs Display over other apps")
}
