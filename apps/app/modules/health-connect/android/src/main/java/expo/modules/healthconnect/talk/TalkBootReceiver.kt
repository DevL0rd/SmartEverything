package expo.modules.healthconnect.talk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class TalkBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (TalkStore(context).enabled()) {
      TalkNotice.reopen(context)
    }
  }
}
