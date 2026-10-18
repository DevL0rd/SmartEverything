package expo.modules.healthconnect.phone

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject

data class LaunchableApp(val packageName: String, val label: String, val updatedAt: Long)

object PhoneApps : PhoneDetailSource {
  override val sections: Set<PhoneSection> = setOf(PhoneSection.APPS)

  private class Snapshot(val installed: List<LaunchableApp>, val usage: List<AppUsage>)

  @Volatile private var snapshot: Snapshot? = null

  fun launchable(context: Context): List<LaunchableApp> {
    val manager = context.packageManager
    val updated = manager.getInstalledPackages(0).associate { it.packageName to it.lastUpdateTime }
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return manager.queryIntentActivities(launcher, 0)
      .map { LaunchableApp(it.activityInfo.packageName, it.loadLabel(manager).toString(), updated[it.activityInfo.packageName] ?: 0L) }
      .distinctBy { it.packageName }
      .sortedBy { it.label.lowercase() }
  }

  fun resolve(query: String, apps: List<LaunchableApp>): LaunchableApp {
    val wanted = query.trim()
    apps.firstOrNull { it.packageName == wanted }?.let { return it }
    val named = apps.filter { it.label.equals(wanted, ignoreCase = true) }
    return when (named.size) {
      0 -> throw PhoneAppUnknown(query)
      1 -> named.single()
      else -> throw PhoneAppAmbiguous(query, named.map { it.packageName })
    }
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? {
    val current = snapshot?.takeUnless { request.slow } ?: refresh(context)
    val sharing = sharesUsage(context)
    return body(
      current.installed,
      { PhoneIcons.hashFor(context, it) },
      if (sharing) current.usage else emptyList(),
      if (sharing && request.live) PhoneAppUsage.front(context) else null
    )
  }

  fun body(installed: List<LaunchableApp>, iconHashOf: (String) -> String?, usage: List<AppUsage>, front: String?): JSONObject = JSONObject()
    .put("installedCount", installed.size)
    .put(
      "installed",
      JSONArray(
        installed.map { app ->
          JSONObject()
            .put("package", app.packageName)
            .put("label", app.label)
            .put("iconHash", iconHashOf(app.packageName) ?: JSONObject.NULL)
        }
      )
    )
    .put("usage", usageBody(usage))
    .put("front", front ?: JSONObject.NULL)

  private fun refresh(context: Context): Snapshot {
    val apps = launchable(context)
    PhoneIcons.sync(context, apps)
    val known = apps.map { it.packageName }.toSet()
    val usage = if (sharesUsage(context)) PhoneAppUsage.week(context).filter { it.packageName in known } else emptyList()
    return Snapshot(apps, usage).also { snapshot = it }
  }

  private fun sharesUsage(context: Context): Boolean =
    PhoneStore(context).sensor(PhoneSensor.APP_USAGE) && PhoneReadings.usageAllowed(context)

  private fun usageBody(usage: List<AppUsage>): JSONArray = JSONArray(
    usage.map { entry ->
      JSONObject()
        .put("package", entry.packageName)
        .put("minutesToday", entry.minutesToday)
        .put("minutesByDay", JSONArray(entry.minutesByDay))
        .put("lastUsedAt", entry.lastUsedAt?.toString() ?: JSONObject.NULL)
    }
  )
}
