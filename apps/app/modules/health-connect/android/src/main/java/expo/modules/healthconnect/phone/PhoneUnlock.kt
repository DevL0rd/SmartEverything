package expo.modules.healthconnect.phone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import expo.modules.healthconnect.NativeGuard
import java.time.Instant

object PhoneUnlock {
  private var receiver: BroadcastReceiver? = null

  @Synchronized
  fun register(context: Context) {
    if (receiver != null || !PhoneStore(context).enabled()) {
      return
    }
    val registered = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("PhoneUnlockReceiver") {
        PhoneReporter.report(context, listOf(PhoneEvent.unlocked(Instant.now())))
      }
    }
    context.applicationContext.registerReceiver(registered, IntentFilter(Intent.ACTION_USER_PRESENT))
    receiver = registered
  }

  @Synchronized
  fun unregister(context: Context) {
    receiver?.let { context.applicationContext.unregisterReceiver(it) }
    receiver = null
  }
}
