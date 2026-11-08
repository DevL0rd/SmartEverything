package expo.modules.healthconnect.photos

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PhotosBackupModule : Module() {
  private var media: PhotosMedia? = null
  private var receiver: BroadcastReceiver? = null

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun media(): PhotosMedia = media ?: PhotosMedia(context().contentResolver, context().cacheDir).also { media = it }

  override fun definition() = ModuleDefinition {
    Name("PhotosBackup")
    Events("chargingChanged")

    AsyncFunction("statMedia") Coroutine { ids: List<String>, id: String ->
      withContext(Dispatchers.IO) { media().stat(ids, id) }
    }
    AsyncFunction("hashFile") Coroutine { uri: String, id: String ->
      withContext(Dispatchers.IO) { media().hash(uri, id) }
    }
    AsyncFunction("readRange") Coroutine { uri: String, id: String, offset: Long, length: Int ->
      withContext(Dispatchers.IO) { media().range(uri, id, offset, length) }
    }
    AsyncFunction("releaseChunk") { uri: String -> media().releaseChunk(uri) }
    Function("prepare") { id: String -> media().prepare(id) }
    Function("cancel") { id: String -> media().cancel(id) }
    AsyncFunction("charging") {
      charging(context().registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)))
    }
    OnStartObserving {
      val listener = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
          sendEvent("chargingChanged", mapOf("charging" to charging(intent)))
        }
      }
      receiver = listener
      context().registerReceiver(listener, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    }
    OnStopObserving { stopObserving() }
    OnDestroy {
      stopObserving()
      media?.close()
      media = null
    }
  }

  private fun stopObserving() {
    receiver?.let { context().unregisterReceiver(it) }
    receiver = null
  }

  private fun charging(intent: Intent?): Boolean =
    requireNotNull(intent).getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
}
