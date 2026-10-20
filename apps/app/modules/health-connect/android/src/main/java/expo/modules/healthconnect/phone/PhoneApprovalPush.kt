package expo.modules.healthconnect.phone

import android.app.Activity
import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.R
import expo.modules.healthconnect.push.MachineApprovalCancelPayload
import expo.modules.healthconnect.push.MachineApprovalPayload
import expo.modules.healthconnect.push.PushCommandHandler
import expo.modules.healthconnect.push.pushPayload
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.SerializationException

enum class AllowAuthentication { Notification, Keyguard }

object PhoneApprovalNotice {
  const val CHANNEL = "smarteverything.approvals"
  const val ID = 7510
  const val PUBLIC_TITLE = "Approval needed"
  const val PUBLIC_TEXT = "Unlock the phone to see what is asked"

  fun allowAuthentication(sdk: Int): AllowAuthentication =
    if (sdk >= Build.VERSION_CODES.S) AllowAuthentication.Notification else AllowAuthentication.Keyguard

  fun title(action: String): String = "Allow ${wording(action)}?"

  fun text(source: String, action: String, machine: String): String =
    "${PhoneAskers.describe(source)} wants to ${wording(action)} $machine"

  private fun wording(action: String): String = action.replace('_', ' ')

  fun cancel(context: Context, requestId: String) {
    context.getSystemService(NotificationManager::class.java).cancel(requestId, ID)
  }

  fun answer(context: Context, requestId: String, allow: Boolean) {
    cancel(context, requestId)
    PhoneActionPush.answer(
      context,
      requestId,
      PhoneActionResult(allow, if (allow) "Approved on the phone" else "Denied on the phone")
    )
  }
}

object PhoneApprovalPush : PushCommandHandler {
  private const val TAG = "SmartEverythingPhone"

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
    manager.createNotificationChannel(
      NotificationChannel(PhoneApprovalNotice.CHANNEL, "Approvals", NotificationManager.IMPORTANCE_HIGH)
        .apply { lockscreenVisibility = Notification.VISIBILITY_PRIVATE }
    )
    val approval = payload.approval
    val notification = Notification.Builder(context, PhoneApprovalNotice.CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(PhoneApprovalNotice.title(approval.action))
      .setContentText(PhoneApprovalNotice.text(approval.source, approval.action, approval.machine))
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion(context))
      .setTimeoutAfter(remaining.toMillis())
      .setAutoCancel(true)
      .addAction(allowAction(context, payload.requestId))
      .addAction(Notification.Action.Builder(null, "Deny", answer(context, payload.requestId, false)).build())
      .build()
    manager.notify(payload.requestId, PhoneApprovalNotice.ID, notification)
  }

  private fun publicVersion(context: Context): Notification =
    Notification.Builder(context, PhoneApprovalNotice.CHANNEL)
      .setSmallIcon(R.drawable.ic_stat_smarteverything)
      .setContentTitle(PhoneApprovalNotice.PUBLIC_TITLE)
      .setContentText(PhoneApprovalNotice.PUBLIC_TEXT)
      .build()

  private fun allowAction(context: Context, requestId: String): Notification.Action =
    when (PhoneApprovalNotice.allowAuthentication(Build.VERSION.SDK_INT)) {
      AllowAuthentication.Notification ->
        Notification.Action.Builder(null, "Allow", answer(context, requestId, true))
          .setAuthenticationRequired(true)
          .build()
      AllowAuthentication.Keyguard ->
        Notification.Action.Builder(null, "Allow", unlockThenAllow(context, requestId)).build()
    }

  private fun answer(context: Context, requestId: String, allow: Boolean): PendingIntent = PendingIntent.getBroadcast(
    context,
    0,
    Intent(context, PhoneApprovalReceiver::class.java)
      .setData(choiceUri(requestId, allow))
      .putExtra(PhoneApprovalReceiver.REQUEST, requestId)
      .putExtra(PhoneApprovalReceiver.ALLOW, allow),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  private fun unlockThenAllow(context: Context, requestId: String): PendingIntent = PendingIntent.getActivity(
    context,
    0,
    Intent(context, PhoneApprovalUnlockActivity::class.java)
      .setData(choiceUri(requestId, true))
      .putExtra(PhoneApprovalReceiver.REQUEST, requestId),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
  )

  private fun choiceUri(requestId: String, allow: Boolean): Uri =
    Uri.fromParts("smarteverything-approval", requestId, if (allow) "allow" else "deny")
}

class PhoneApprovalReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("PhoneApprovalReceiver") {
      val requestId = intent.getStringExtra(REQUEST) ?: return@run
      PhoneApprovalNotice.answer(context, requestId, intent.getBooleanExtra(ALLOW, false))
    }
  }

  companion object {
    const val REQUEST = "requestId"
    const val ALLOW = "allow"
  }
}

class PhoneApprovalUnlockActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val requestId = intent.getStringExtra(PhoneApprovalReceiver.REQUEST)
    if (requestId == null) {
      finish()
      return
    }
    val keyguard = getSystemService(KeyguardManager::class.java)
    if (!keyguard.isKeyguardLocked) {
      NativeGuard.run("PhoneApprovalUnlockActivity") {
        PhoneApprovalNotice.answer(applicationContext, requestId, true)
      }
      finish()
      return
    }
    keyguard.requestDismissKeyguard(
      this,
      object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() {
          NativeGuard.run("PhoneApprovalUnlockActivity") {
            PhoneApprovalNotice.answer(applicationContext, requestId, true)
          }
          finish()
        }

        override fun onDismissCancelled() = finish()

        override fun onDismissError() = finish()
      }
    )
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
    PhoneApprovalNotice.cancel(context, requestId)
  }
}
