package expo.modules.healthconnect.planner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.diagnostics.NativeLog

class TimeChangeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("PlannerTimeChangeReceiver") {
      NativeLog.info("planner-alarm", "rearm") { mapOf("action" to intent.action) }
      AlarmScheduler.of(context).rearm()
    }
  }
}
