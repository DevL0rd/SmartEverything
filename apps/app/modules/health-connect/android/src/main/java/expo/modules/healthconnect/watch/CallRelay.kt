package expo.modules.healthconnect.watch

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.provider.ContactsContract
import android.telecom.TelecomManager
import android.telephony.TelephonyManager

class CallRelay(private val context: Context) : BroadcastReceiver() {
  private var ringing = false

  fun register() {
    context.registerReceiver(this, IntentFilter(TelephonyManager.ACTION_PHONE_STATE_CHANGED))
  }

  fun unregister() {
    context.unregisterReceiver(this)
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (!NotificationRules.read(context).calls) {
      return
    }
    when (intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {
      TelephonyManager.EXTRA_STATE_RINGING -> ring(intent)
      else -> if (ringing) {
        ringing = false
        unmute(context)
        WatchActions.send(WatchAction.CallEnded())
      }
    }
  }

  @Suppress("DEPRECATION")
  private fun ring(intent: Intent) {
    val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER)
    if (number == null && granted(context, Manifest.permission.READ_CALL_LOG)) {
      return
    }
    if (ringing && number == null) {
      return
    }
    ringing = true
    val shown = number ?: "Number hidden: allow Call logs"
    WatchActions.send(WatchAction.IncomingCall(number?.let { nameOf(it) } ?: shown, number.orEmpty()))
  }

  private fun nameOf(number: String): String? {
    if (!granted(context, Manifest.permission.READ_CONTACTS)) {
      return null
    }
    val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
    return context.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup.DISPLAY_NAME), null, null, null)
      ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
  }

  companion object {
    val PERMISSIONS = listOf(
      Manifest.permission.READ_PHONE_STATE,
      Manifest.permission.READ_CALL_LOG,
      Manifest.permission.READ_CONTACTS,
      Manifest.permission.ANSWER_PHONE_CALLS
    )

    fun granted(context: Context, permission: String): Boolean =
      context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun missing(context: Context): List<String> = PERMISSIONS.filter { !granted(context, it) }

    fun reject(context: Context) {
      if (!granted(context, Manifest.permission.ANSWER_PHONE_CALLS)) {
        WatchEvents.emit("call_reject_failed", "Rejecting calls from the watch needs the Phone permission")
        return
      }
      @Suppress("DEPRECATION")
      val ended = context.getSystemService(TelecomManager::class.java).endCall()
      WatchEvents.emit(if (ended) "call_rejected" else "call_reject_failed", if (ended) "rejected from the watch" else "Android did not end the call")
    }

    private var muted = false

    fun unmute(context: Context) {
      if (muted) {
        muted = false
        context.getSystemService(AudioManager::class.java)
          .adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_UNMUTE, 0)
      }
    }

    fun mute(context: Context) {
      try {
        context.getSystemService(AudioManager::class.java)
          .adjustStreamVolume(AudioManager.STREAM_RING, AudioManager.ADJUST_MUTE, 0)
        muted = true
        WatchEvents.emit("call_muted", "ringer muted from the watch until the call ends")
      } catch (failure: SecurityException) {
        WatchEvents.emit("call_mute_failed", "Muting the ringer needs Do Not Disturb access: ${failure.message}")
      }
    }
  }
}
