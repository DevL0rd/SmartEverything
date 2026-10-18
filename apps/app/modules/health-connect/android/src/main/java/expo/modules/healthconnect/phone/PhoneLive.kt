package expo.modules.healthconnect.phone

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import expo.modules.healthconnect.NativeGuard

class PhoneLiveUnavailable : PhoneFailure("Live mode needs the phone report switched on in SmartEverything on this phone")

object PhoneLive {
  const val LEASE_MS = 600_000L
  private const val EXPIRED = "expo.modules.healthconnect.phone.LIVE_EXPIRED"
  private const val REQUEST_CODE = 7511

  @Volatile
  var active = false
    private set

  private var expiry: BroadcastReceiver? = null

  @Synchronized
  fun set(context: Context, on: Boolean) {
    val app = context.applicationContext
    if (on) renew(app) else release(app)
    PhoneReporter.report(app, full = on)
  }

  fun leaseEndsAt(now: Long): Long = now + LEASE_MS

  private fun renew(context: Context) {
    if (!PhoneStore(context).enabled()) {
      throw PhoneLiveUnavailable()
    }
    if (!active) {
      active = true
      PhoneDetailRegistry.sources.forEach { source -> PhoneGuard.run("${source.javaClass.simpleName} live listeners") { source.startLive(context) } }
      listenForExpiry(context)
    }
    context.getSystemService(AlarmManager::class.java).setAndAllowWhileIdle(AlarmManager.RTC, leaseEndsAt(System.currentTimeMillis()), expiryIntent(context))
  }

  private fun release(context: Context) {
    context.getSystemService(AlarmManager::class.java).cancel(expiryIntent(context))
    if (!active) {
      return
    }
    active = false
    PhoneDetailRegistry.sources.forEach { source -> PhoneGuard.run("${source.javaClass.simpleName} live listeners") { source.stopLive(context) } }
    expiry?.let { context.unregisterReceiver(it) }
    expiry = null
  }

  private fun listenForExpiry(context: Context) {
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("PhoneLiveExpiry") { set(context, false) }
    }
    context.registerReceiver(receiver, IntentFilter(EXPIRED), Context.RECEIVER_NOT_EXPORTED)
    expiry = receiver
  }

  private fun expiryIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(EXPIRED).setPackage(context.packageName),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )
}
