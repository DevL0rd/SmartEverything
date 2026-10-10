package expo.modules.healthconnect.push

import android.util.Log
import androidx.work.WorkManager
import com.google.firebase.messaging.RemoteMessage
import expo.modules.healthconnect.CredentialSlot
import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.NativeGuard
import expo.modules.healthconnect.phone.PhonePostWorker
import org.json.JSONObject
import expo.modules.notifications.service.ExpoFirebaseMessagingService

class PushMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    val command = remoteMessage.data[PushCommands.KEY]
    if (command == null) {
      super.onMessageReceived(remoteMessage)
      return
    }
    PushCommands.run(applicationContext, remoteMessage.data)
  }

  override fun onNewToken(token: String) {
    super.onNewToken(token)
    NativeGuard.run("push token refresh") {
      if (!Credentials(applicationContext, CredentialSlot.SERVER).configured()) {
        Log.i(TAG, "a new push token arrived before this phone was paired; the app registers it when paired")
        return@run
      }
      val body = JSONObject().put("token", token).put("platform", "android")
      WorkManager.getInstance(applicationContext).enqueue(PhonePostWorker.replace(PhonePostWorker.PUSH_TARGET_PATH, body))
    }
  }

  private companion object {
    const val TAG = "SmartEverythingPush"
  }
}
