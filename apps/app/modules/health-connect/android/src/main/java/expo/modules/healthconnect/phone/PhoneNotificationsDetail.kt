package expo.modules.healthconnect.phone

import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import android.service.notification.StatusBarNotification
import expo.modules.healthconnect.media.NotificationObserver
import expo.modules.healthconnect.media.NowPlaying
import expo.modules.healthconnect.watch.WatchNotificationListener
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

data class ActiveNotice(
  val key: String,
  val packageName: String,
  val label: String,
  val title: String?,
  val at: Long,
  val countable: Boolean
)

object PhoneNotificationsDetail : PhoneDetailSource, NotificationObserver {
  override val sections: Set<PhoneSection> = setOf(PhoneSection.NOTIFICATIONS)

  fun body(notices: List<ActiveNotice>, titles: Boolean): JSONObject {
    val counted = notices.filter { it.countable }
    val apps = counted.groupBy { it.packageName }.map { (packageName, own) ->
      JSONObject().put("package", packageName).put("label", own.first().label).put("count", own.size)
    }.sortedWith(compareByDescending<JSONObject> { it.getInt("count") }.thenBy { it.getString("label").lowercase() })
    val items = if (titles) JSONArray(counted.sortedByDescending { it.at }.map(::item)) else JSONObject.NULL
    return JSONObject().put("count", counted.size).put("apps", JSONArray(apps)).put("items", items)
  }

  fun appOf(query: String, notices: List<ActiveNotice>): String {
    val wanted = query.trim()
    notices.firstOrNull { it.packageName == wanted }?.let { return it.packageName }
    val named = notices.filter { it.label.equals(wanted, ignoreCase = true) }.map { it.packageName }.distinct()
    return when (named.size) {
      0 -> throw PhoneAppUnknown(query)
      1 -> named.single()
      else -> throw PhoneAppAmbiguous(query, named)
    }
  }

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> {
    if (!request.wants(PhoneSection.NOTIFICATIONS)) return emptyMap()
    return current(context)?.let { notices -> mapOf("notification_count" to notices.count { it.countable }) } ?: emptyMap()
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? =
    current(context)?.let { body(it, PhoneStore(context).sensor(PhoneSensor.NOTIFICATION_TITLES)) }

  fun dismiss(context: Context, target: JSONObject): PhoneActionResult {
    val listener = WatchNotificationListener.active ?: throw PhoneNotificationAccessOff()
    if (target.getString("by") == "key") {
      listener.cancelNotification(target.getString("key"))
      return PhoneActionResult(true, "Dismissed the notification")
    }
    val notices = current(context).orEmpty()
    val packageName = appOf(target.getString("app"), notices)
    val keys = notices.filter { it.countable && it.packageName == packageName }.map { it.key }
    listener.cancelNotifications(keys.toTypedArray())
    return PhoneActionResult(true, "Dismissed ${keys.size} notifications from ${notices.first { it.packageName == packageName }.label}")
  }

  override fun connected(context: Context) = PhoneReporter.report(context, slow = true)

  override fun disconnected(context: Context) = Unit

  override fun posted(context: Context, sbn: StatusBarNotification) = changed(context, sbn)

  override fun removed(context: Context, sbn: StatusBarNotification) = changed(context, sbn)

  override fun media(context: Context, nowPlaying: NowPlaying) = Unit

  private fun changed(context: Context, sbn: StatusBarNotification) {
    if (PhoneLive.active && countable(sbn)) PhoneReporter.report(context)
  }

  private fun current(context: Context): List<ActiveNotice>? {
    val listener = WatchNotificationListener.active ?: return null
    val labels = mutableMapOf<String, String>()
    return listener.activeNotifications.orEmpty().map { sbn ->
      val label = labels.getOrPut(sbn.packageName) { labelOf(context, sbn.packageName) }
      ActiveNotice(
        sbn.key,
        sbn.packageName,
        label,
        sbn.notification.extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.takeIf(String::isNotBlank),
        sbn.postTime,
        countable(sbn)
      )
    }
  }

  private fun countable(sbn: StatusBarNotification): Boolean {
    val flags = sbn.notification.flags
    return !sbn.isOngoing && flags and Notification.FLAG_GROUP_SUMMARY == 0 && flags and Notification.FLAG_FOREGROUND_SERVICE == 0
  }

  private fun labelOf(context: Context, packageName: String): String = try {
    context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(packageName, 0)).toString()
  } catch (failure: PackageManager.NameNotFoundException) {
    PhoneEvents.emit("notification_label_unknown", "$packageName is not visible to this app: ${failure.message.orEmpty()}")
    packageName
  }

  private fun item(notice: ActiveNotice): JSONObject = JSONObject()
    .put("key", notice.key)
    .put("package", notice.packageName)
    .put("title", notice.title ?: JSONObject.NULL)
    .put("at", Instant.ofEpochMilli(notice.at).toString())
}
