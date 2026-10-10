package expo.modules.healthconnect.watch

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Settings

enum class NotificationContent(val label: String) {
  FULL("full"),
  TITLE("title"),
  APP("app")
}

class NotificationPrefs(
  val enabled: Boolean,
  val apps: Set<String>,
  val content: NotificationContent,
  val onlyWhenLocked: Boolean,
  val calls: Boolean,
  val music: Boolean,
  val findPhone: Boolean
) {
  fun toMap(): Map<String, Any> = mapOf(
    "enabled" to enabled,
    "apps" to apps.sorted(),
    "content" to content.label,
    "onlyWhenLocked" to onlyWhenLocked,
    "calls" to calls,
    "music" to music,
    "findPhone" to findPhone
  )
}

object NotificationRules {
  private const val PREFERENCES = "expo.modules.healthconnect.watch-relay"

  fun read(context: Context): NotificationPrefs {
    val p = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
    return NotificationPrefs(
      enabled = p.getBoolean("enabled", false),
      apps = p.getStringSet("apps", emptySet()).orEmpty().toSet(),
      content = NotificationContent.entries.first { it.label == p.getString("content", NotificationContent.FULL.label) },
      onlyWhenLocked = p.getBoolean("onlyWhenLocked", false),
      calls = p.getBoolean("calls", false),
      music = p.getBoolean("music", false),
      findPhone = p.getBoolean("findPhone", true)
    )
  }

  fun write(context: Context, prefs: NotificationPrefs) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
      .putBoolean("enabled", prefs.enabled)
      .putStringSet("apps", prefs.apps)
      .putString("content", prefs.content.label)
      .putBoolean("onlyWhenLocked", prefs.onlyWhenLocked)
      .putBoolean("calls", prefs.calls)
      .putBoolean("music", prefs.music)
      .putBoolean("findPhone", prefs.findPhone)
      .apply()
  }

  fun listenerAllowed(context: Context): Boolean {
    val enabled = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners").orEmpty()
    val component = ComponentName(context, WatchNotificationListener::class.java)
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == component }
  }

  fun openListenerSettings(context: Context) {
    context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  fun installedApps(context: Context): List<Map<String, String>> {
    val manager = context.packageManager
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return manager.queryIntentActivities(launcher, PackageManager.MATCH_ALL)
      .map { it.activityInfo.applicationInfo }
      .distinctBy { it.packageName }
      .filter { it.packageName != context.packageName }
      .map { mapOf("packageName" to it.packageName, "label" to manager.getApplicationLabel(it).toString()) }
      .sortedBy { it["label"].orEmpty().lowercase() }
  }
}
