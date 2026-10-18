package expo.modules.healthconnect.assistant

import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.overlay.OverlayStage
import expo.modules.healthconnect.phone.PhonePermissions

class SettingsPageMissing(page: String) : Exception("This phone has no settings page for $page")

object AssistantSetup {
  fun isDefaultAssistant(context: Context): Boolean =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      context.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_ASSISTANT)
    } else {
      AssistantInteractionService.active != null
    }

  fun status(context: Context): Map<String, Any> = mapOf(
    "host" to OverlayStage.host.label,
    "assistantRole" to isDefaultAssistant(context),
    "canDrawOverlays" to Settings.canDrawOverlays(context),
    "batteryUnrestricted" to PhonePermissions.batteryUnrestricted(context)
  )

  fun openAssistantSettings(context: Context) =
    open(context, "the digital assistant", Intent(Settings.ACTION_VOICE_INPUT_SETTINGS), Intent(Settings.ACTION_MANAGE_DEFAULT_APPS_SETTINGS))

  fun openOverlaySettings(context: Context) = open(
    context,
    "showing over other apps",
    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
  )

  private fun open(context: Context, page: String, vararg choices: Intent) {
    val opened = choices.any { intent ->
      try {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
      } catch (missing: ActivityNotFoundException) {
        NativeLog.warn(SCOPE, "settings.page_missing", missing) { mapOf("action" to intent.action) }
        false
      }
    }
    if (!opened) throw SettingsPageMissing(page)
  }

  private const val SCOPE = "assistant-setup"
}
