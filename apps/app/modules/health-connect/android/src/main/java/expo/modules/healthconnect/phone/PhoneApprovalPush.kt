package expo.modules.healthconnect.phone

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.push.MachineApprovalCancelPayload
import expo.modules.healthconnect.push.MachineApprovalPayload
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.pushPayload
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.SerializationException

object PhoneApprovalPush : PushCommandHandler {
  private const val TAG = "SmartEverythingPhone"
  private const val CHANNEL = "smarteverything.approvals"
  private val SOURCES = mapOf("assistant" to "Your assistant", "automation" to "An automation", "scene" to "A scene")

  override fun handle(context: Context, data: Map<String, String>) {
    val payload = try {
      data.pushPayload<MachineApprovalPayload>()
    } catch (failure: SerializationException) {
      Log.e(TAG, "An approval push could not be read: ${failure.message}")
      return
    }
    val remaining = Duration.between(Instant.now(), payload.expiresAt)
    if (remaining.isNegative || remaining.isZero) {
      return
    }
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "Approvals", NotificationManager.IMPORTANCE_HIGH))
    val what = payload.approval.action.replace('_', ' ')
    val who = SOURCES[payload.approval.source] ?: payload.approval.source
    val notification = Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("Allow $what?")
      .setContentText("$who wants to $what ${payload.approval.machine}")
      .setTimeoutAfter(remaining.toMillis())
      .setAutoCancel(true)
      .addAction(Notification.Action.Builder(null, "Allow", answer(context, payload.requestId, true)).build())
      .addAction(Notification.Action.Builder(null, "Deny", answer(context, payload.requestId, false)).build())
      .build()
    manager.notify(payload.requestId.hashCode(), notification)
  }

  fun answer(context: Context, requestId: String, allow: Boolean): PendingIntent = PendingIntent.getBroadcast(
    context,
    requestId.hashCode() + if (allow) 1 else 2,
    Intent(context, PhoneApprovalReceiver::class.java)
      .putExtra(PhoneApprovalReceiver.REQUEST, requestId)
      .putExtra(PhoneApprovalReceiver.ALLOW, allow),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )
}

class PhoneApprovalReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("PhoneApprovalReceiver") {
      val requestId = intent.getStringExtra(REQUEST) ?: return@run
      val allow = intent.getBooleanExtra(ALLOW, false)
      context.getSystemService(NotificationManager::class.java).cancel(requestId.hashCode())
      PhoneActionPush.answer(context, requestId, PhoneActionResult(allow, if (allow) "Approved on the phone" else "Denied on the phone"))
    }
  }

  companion object {
    const val REQUEST = "requestId"
    const val ALLOW = "allow"
  }
}

object PhoneApprovalCancelPush : PushCommandHandler {
  override fun handle(context: Context, data: Map<String, String>) {
    val requestId = try {
      data.pushPayload<MachineApprovalCancelPayload>().requestId
    } catch (failure: SerializationException) {
      Log.e("SmartEverythingPhone", "An approval cancel push could not be read: ${failure.message}")
      return
    }
    context.getSystemService(NotificationManager::class.java).cancel(requestId.hashCode())
  }
}
