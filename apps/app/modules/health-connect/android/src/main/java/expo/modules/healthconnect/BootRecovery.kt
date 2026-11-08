package expo.modules.healthconnect

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.larq.LarqScan
import expo.modules.healthconnect.larq.LarqStore
import expo.modules.healthconnect.phone.PhoneNode
import expo.modules.healthconnect.planner.AlarmScheduler
import expo.modules.healthconnect.talk.TalkNotice
import expo.modules.healthconnect.talk.TalkStore

class BootRecovery : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("BootRecovery") {
      NativeLog.info("boot-recovery", "started") { mapOf("action" to intent.action) }
      step(context, "planner") { AlarmScheduler.of(context).rearm() }
      step(context, "talk") {
        if (TalkStore(context).enabled()) TalkNotice.reopen(context)
      }
      step(context, "phone") { PhoneNode.watch(context) }
      step(context, "bottle") { LarqScan.register(context, LarqStore(context).bottles()) }
      step(context, "scale") { ScaleRelay(context).resume() }
    }
  }

  private fun step(context: Context, name: String, restart: () -> Unit) {
    try {
      restart()
    } catch (failure: Exception) {
      NativeLog.warn("boot-recovery", "step.failed") {
        mapOf("step" to name, "reason" to "${failure.javaClass.simpleName}: ${failure.message}")
      }
      if (name == "scale") {
        ScaleStatus(context).note("failed", "Listening did not restart: ${failure.message}")
      }
    }
  }
}
