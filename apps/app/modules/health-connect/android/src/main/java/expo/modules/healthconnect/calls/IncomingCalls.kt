package expo.modules.healthconnect.calls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Person
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.work.WorkManager
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.phone.PhonePostWorker
import expo.modules.healthconnect.push.PushCommandHandler
import org.json.JSONException
import org.json.JSONObject

object IncomingCalls {
  const val TAG = "SmartEverythingCalls"
  const val ACTION_ENDED = "expo.modules.healthconnect.calls.ENDED"
  const val ACTION_ANSWER = "expo.modules.healthconnect.calls.ANSWER"
  private const val CHANNEL = "smarteverything.ai-calls"
  private const val ACTION_DECLINE = "expo.modules.healthconnect.calls.DECLINE"

  @Volatile
  var appForeground = false

  fun ring(context: Context, call: IncomingCall) {
    if (call.expired()) {
      Log.w(TAG, "AI call ${call.outreachId} had already ended when it arrived (ended at ${call.expiresAt}, phone clock ${System.currentTimeMillis()}); a wrong phone clock also causes this")
      return
    }
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(channel())
    manager.notify(call.notificationId, notification(context, call))
  }

  fun dismiss(context: Context, outreachId: String) {
    context.getSystemService(NotificationManager::class.java).cancel(outreachId.hashCode())
  }

  fun ended(context: Context, outreachId: String) {
    dismiss(context, outreachId)
    context.sendBroadcast(Intent(ACTION_ENDED).setPackage(context.packageName).putExtra("outreachId", outreachId))
  }

  fun decline(context: Context, outreachId: String) {
    ended(context, outreachId)
    WorkManager.getInstance(context).enqueue(PhonePostWorker.request("../reach/outreach/$outreachId/decline", JSONObject()))
  }

  private fun channel(): NotificationChannel = NotificationChannel(CHANNEL, "AI calls", NotificationManager.IMPORTANCE_HIGH).apply {
    description = "When your AI calls you"
    setSound(
      RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE).build()
    )
    enableVibration(true)
  }

  private fun screen(context: Context, call: IncomingCall, action: String?): PendingIntent {
    val intent = call.into(Intent(context, IncomingCallActivity::class.java).setAction(action))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    return PendingIntent.getActivity(context, call.notificationId + (action?.hashCode() ?: 0), intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun declining(context: Context, call: IncomingCall): PendingIntent = PendingIntent.getBroadcast(
    context,
    call.notificationId,
    call.into(Intent(context, IncomingCallDeclineReceiver::class.java).setAction(ACTION_DECLINE)),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  private fun notification(context: Context, call: IncomingCall): Notification {
    val builder = Notification.Builder(context, CHANNEL)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle("${call.caller} is calling")
      .setContentText(call.reason)
      .setCategory(Notification.CATEGORY_CALL)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setFullScreenIntent(screen(context, call, null), true)
      .setContentIntent(screen(context, call, null))
      .setTimeoutAfter((call.expiresAt - System.currentTimeMillis()).coerceAtLeast(1_000L))
    val answer = screen(context, call, ACTION_ANSWER)
    val decline = declining(context, call)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val person = Person.Builder().setName(call.caller).setImportant(true).build()
      builder.setStyle(Notification.CallStyle.forIncomingCall(person, decline, answer))
    } else {
      builder.addAction(Notification.Action.Builder(null, "Decline", decline).build())
      builder.addAction(Notification.Action.Builder(null, "Answer", answer).build())
    }
    return builder.build()
  }
}

class IncomingCallDeclineReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("IncomingCallDeclineReceiver") {
    val call = IncomingCall.fromIntent(intent) ?: return@run
    IncomingCalls.decline(context, call.outreachId)
  }
}

object IncomingCallPush : PushCommandHandler {
  override fun handle(context: Context, data: Map<String, String>) {
    try {
      val call = IncomingCall.fromPayload(data["payload"].orEmpty())
      if (IncomingCalls.appForeground) {
        Log.i(IncomingCalls.TAG, "AI call ${call.outreachId} left to the open app")
        return
      }
      IncomingCalls.ring(context, call)
    } catch (failure: IncomingCallInvalid) {
      Log.e(IncomingCalls.TAG, failure.message.orEmpty())
    } catch (failure: SecurityException) {
      Log.e(IncomingCalls.TAG, "The AI call could not ring: ${failure.message}")
    }
  }
}

object IncomingCallCancelPush : PushCommandHandler {
  override fun handle(context: Context, data: Map<String, String>) {
    val outreachId = try {
      JSONObject(data["payload"].orEmpty()).optString("outreachId")
    } catch (failure: JSONException) {
      Log.e(IncomingCalls.TAG, "An AI call cancel push could not be read: ${failure.message}")
      return
    }
    if (outreachId.isEmpty()) {
      Log.e(IncomingCalls.TAG, "An AI call cancel push named no outreachId")
      return
    }
    IncomingCalls.ended(context, outreachId)
  }
}
