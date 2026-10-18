package expo.modules.healthconnect.phone

import android.content.Context
import android.content.Intent

object PhoneLaunch {
  fun run(context: Context, query: String): PhoneActionResult {
    val app = PhoneApps.resolve(query, PhoneApps.launchable(context))
    val intent = context.packageManager.getLaunchIntentForPackage(app.packageName)
      ?: throw PhoneAppNotLaunchable(app.packageName)
    if (!PhonePermissions.overlay(context)) {
      return PhoneNotices.tapToOpen(context, app.label, intent)
    }
    context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    return PhoneActionResult(true, "Asked the phone to open ${app.label}")
  }
}
