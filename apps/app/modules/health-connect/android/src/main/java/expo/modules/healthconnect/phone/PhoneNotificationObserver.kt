package expo.modules.healthconnect.phone

import android.app.Notification
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.service.notification.StatusBarNotification
import expo.modules.healthconnect.media.NotificationObserver
import expo.modules.healthconnect.media.NowPlaying
import java.util.Collections

object PhoneNotificationObserver : NotificationObserver {
  private val NAVIGATION_APPS = setOf("com.google.android.apps.maps", "com.waze", "com.here.app.maps")
  private val navigations: MutableSet<String> = Collections.synchronizedSet(mutableSetOf())
  private var receiver: BroadcastReceiver? = null

  override fun connected(context: Context) {
    val changes = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) =
        PhoneReporter.report(context, screenTime = intent.action == Intent.ACTION_SCREEN_OFF)
    }
    val filter = IntentFilter().apply {
      addAction(Intent.ACTION_BATTERY_CHANGED)
      addAction(Intent.ACTION_SCREEN_OFF)
      addAction(Intent.ACTION_SCREEN_ON)
      addAction(Intent.ACTION_POWER_CONNECTED)
      addAction(Intent.ACTION_POWER_DISCONNECTED)
      addAction(AudioManager.RINGER_MODE_CHANGED_ACTION)
      addAction(NotificationManager.ACTION_INTERRUPTION_FILTER_CHANGED)
    }
    context.registerReceiver(changes, filter, Context.RECEIVER_NOT_EXPORTED)
    receiver = changes
  }

  override fun disconnected(context: Context) {
    receiver?.let { context.unregisterReceiver(it) }
    receiver = null
  }

  override fun posted(context: Context, sbn: StatusBarNotification) {
    if (!isNavigation(sbn)) {
      return
    }
    if (navigations.add(sbn.key) && navigations.size == 1) {
      navigation(context, true)
    }
  }

  override fun removed(context: Context, sbn: StatusBarNotification) {
    if (navigations.remove(sbn.key) && navigations.isEmpty()) {
      navigation(context, false)
    }
  }

  override fun media(context: Context, nowPlaying: NowPlaying) = PhoneReporter.report(context)

  private fun isNavigation(sbn: StatusBarNotification): Boolean =
    sbn.packageName in NAVIGATION_APPS && sbn.isOngoing &&
      sbn.notification.category == Notification.CATEGORY_NAVIGATION

  private fun navigation(context: Context, active: Boolean) {
    if (PhoneStore(context).sensor(PhoneSensor.NAVIGATION)) {
      PhoneContextInputs.feed(context, ContextInput.Navigation(active))
    }
  }
}
