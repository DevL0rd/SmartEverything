package expo.modules.healthconnect.watch

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.healthconnect.WatchNotConfigured
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class RelayChange : Record {
  @Field val enabled: Boolean? = null
  @Field val apps: List<String>? = null
  @Field val content: String? = null
  @Field val onlyWhenLocked: Boolean? = null
  @Field val calls: Boolean? = null
  @Field val music: Boolean? = null
  @Field val findPhone: Boolean? = null
}

object WatchPhoneBridge {
  fun findWatch(context: Context, deviceId: String, on: Boolean): Boolean {
    WatchStore(context).watches().firstOrNull { it.deviceId == deviceId } ?: throw WatchNotConfigured(deviceId)
    return WatchActions.sendTo(deviceId, WatchAction.FindWatch(on))
  }

  fun setUser(context: Context, user: WatchUser): Int {
    WatchUserStore.save(context, user)
    return WatchActions.send(WatchAction.SetUser(user))
  }

  fun relayStatus(context: Context): Map<String, Any> = NotificationRules.read(context).toMap() + mapOf(
    "listenerAllowed" to NotificationRules.listenerAllowed(context),
    "callPermissionsMissing" to CallRelay.missing(context),
    "dndAllowed" to context.getSystemService(NotificationManager::class.java).isNotificationPolicyAccessGranted
  )

  fun setRelay(context: Context, change: RelayChange) {
    val current = NotificationRules.read(context)
    NotificationRules.write(
      context,
      NotificationPrefs(
        enabled = change.enabled ?: current.enabled,
        apps = change.apps?.toSet() ?: current.apps,
        content = change.content?.let { label -> NotificationContent.entries.first { it.label == label } } ?: current.content,
        onlyWhenLocked = change.onlyWhenLocked ?: current.onlyWhenLocked,
        calls = change.calls ?: current.calls,
        music = change.music ?: current.music,
        findPhone = change.findPhone ?: current.findPhone
      )
    )
    WatchEvents.emit("relay_settings", NotificationRules.read(context).toMap().toString())
  }

  fun openDndSettings(context: Context) {
    context.startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }
}
