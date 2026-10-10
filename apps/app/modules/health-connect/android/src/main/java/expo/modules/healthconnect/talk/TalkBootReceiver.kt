package expo.modules.healthconnect.talk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.NativeGuard

class TalkBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    NativeGuard.run("TalkBootReceiver") {
      if (TalkStore(context).enabled()) {
        TalkNotice.reopen(context)
      }
    }
  }
}
