package expo.modules.healthconnect.planner

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.healthconnect.R
import java.time.Instant

object RingNotice {
  const val ID = 7511
  private const val CHANNEL = "smarteverything.ring"
  private const val SCHEME = "smarteverything"

  fun generic(context: Context): Notification = builder(context).setContentTitle("Alarm").build()

  fun of(context: Context, ring: PhoneRing, snoozesLeft: Int?): Notification {
    val open = open(context, ring.ringKey)
    val title = ring.label ?: if (ring.kind == RingKind.TIMER) "Timer" else "Alarm"
    val text = if (ring.kind == RingKind.TIMER) "Time is up" else "Ringing now"
    val builder = builder(context)
      .setContentTitle(title)
      .setContentText(text)
      .setContentIntent(open)
      .setWhen(Instant.now().toEpochMilli())
    RingActions.of(ring.challenge, snoozesLeft).forEach { builder.addAction(action(context, it, ring.ringKey)) }
    val manager = context.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE || manager.canUseFullScreenIntent()) {
      builder.setFullScreenIntent(open, true)
    }
    return builder.build()
  }

  private fun builder(context: Context): Notification.Builder {
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(CHANNEL, "Alarms and timers", NotificationManager.IMPORTANCE_HIGH)
    channel.setSound(null, null)
    channel.enableVibration(false)
    channel.setBypassDnd(true)
    manager.createNotificationChannel(channel)
    return Notification.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setCategory(Notification.CATEGORY_ALARM)
      .setOngoing(true)
      .setVisibility(Notification.VISIBILITY_PUBLIC)
      .setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE)
  }

  private fun open(context: Context, ringKey: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, RingKeys.linkOf(SCHEME, ringKey))
      .setPackage(context.packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, ringKey.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun action(context: Context, action: RingAction, ringKey: String): Notification.Action {
    val (label, name) = when (action) {
      RingAction.SNOOZE -> "Snooze" to RingControl.ACTION_SNOOZE
      RingAction.STOP -> "Stop" to RingControl.ACTION_STOP
    }
    val pending = PendingIntent.getService(
      context,
      ringKey.hashCode(),
      RingControl.intent(context, name, ringKey),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    return Notification.Action.Builder(null, label, pending).build()
  }
}
