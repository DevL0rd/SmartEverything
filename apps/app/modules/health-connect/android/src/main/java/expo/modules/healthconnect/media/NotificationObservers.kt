package expo.modules.healthconnect.media

import android.content.Context
import android.service.notification.StatusBarNotification
import expo.modules.healthconnect.phone.PhoneNotificationObserver
import expo.modules.healthconnect.phone.PhoneNotificationsDetail

interface NotificationObserver {
  fun connected(context: Context)
  fun disconnected(context: Context)
  fun posted(context: Context, sbn: StatusBarNotification)
  fun removed(context: Context, sbn: StatusBarNotification)
  fun media(context: Context, nowPlaying: NowPlaying)
}

object NotificationObservers {
  val ALL: List<NotificationObserver> = listOf(PhoneNotificationObserver, PhoneNotificationsDetail)
}
