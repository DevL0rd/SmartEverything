package expo.modules.healthconnect.photos

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.BatteryManager
import android.os.Build
import android.provider.MediaStore
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PhotosBackupModule : Module() {
  private var media: PhotosMedia? = null
  private var receiver: BroadcastReceiver? = null
  private val trash = PhotosTrash(
    Build.VERSION.SDK_INT,
    { ids -> trashRows(ids) },
    { rows, trashed -> withContext(Dispatchers.Main) { askTrash(rows, trashed) } }
  )

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun media(): PhotosMedia = media ?: PhotosMedia(context().contentResolver, context().cacheDir) {
    context().checkSelfPermission(Manifest.permission.ACCESS_MEDIA_LOCATION) == PackageManager.PERMISSION_GRANTED
  }.also { media = it }

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
    AsyncFunction("changeTrash") Coroutine { ids: List<String>, trashed: Boolean ->
      withContext(Dispatchers.IO) { trash.change(ids, trashed) }
    }
    OnActivityResult { _, payload ->
      if (payload.requestCode == REQUEST_TRASH) trash.finish(payload.resultCode == Activity.RESULT_OK)
    }
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

  private fun trashRows(ids: List<Long>): List<TrashRow> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) error("The system trash needs Android 11")
    return MediaTrashQuery.rows(context().contentResolver, ids)
  }

  private fun askTrash(rows: List<TrashRow>, trashed: Boolean) {
    val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) error("The system trash needs Android 11")
    val request = MediaStore.createTrashRequest(context().contentResolver, rows.map(MediaTrashQuery::uriOf), trashed)
    activity.startIntentSenderForResult(request.intentSender, REQUEST_TRASH, null, 0, 0, 0)
  }

  private fun stopObserving() {
    receiver?.let { context().unregisterReceiver(it) }
    receiver = null
  }

  private fun charging(intent: Intent?): Boolean =
    requireNotNull(intent).getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0

  private companion object {
    const val REQUEST_TRASH = 0x5C42
  }
}
