package expo.modules.healthconnect.push

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class PushMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val command = remoteMessage.data[PushCommands.KEY]
    if (command == null) {
      super.onMessageReceived(remoteMessage)
      return
    }
    val handler = PushCommands.HANDLERS[command]
    if (handler == null) {
      Log.e(TAG, "push command \"$command\" has no handler; expected one of ${PushCommands.HANDLERS.keys}")
      return
    }
    handler.handle(applicationContext, remoteMessage.data)
  }

  private companion object {
    const val TAG = "SmartEverythingPush"
  }
}
