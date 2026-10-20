package expo.modules.healthconnect.phone

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.annotation.RequiresApi
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.json.JSONObject

object PhoneFiles {
  const val FOLDER = "SmartEverything"

  fun receive(context: Context, action: JSONObject): PhoneActionResult {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) throw PhoneFilesUnsupported()
    val name = action.getString("name")
    val mime = action.getString("mime")
    val url = action.getString("url")
    val uri = insert(context, name, mime)
    try {
      val saved = context.contentResolver.openOutputStream(uri)?.use { sink ->
        runBlocking { HubClient(relayTarget(context)).download(url, sink) }
      } ?: throw IOException("Android gave no place to write the file")
      context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
      return PhoneActionResult(true, "Saved $name ($saved bytes) in Downloads/$FOLDER")
    } catch (failure: IOException) {
      throw discarded(context, uri, name, failure)
    } catch (failure: SyncFailure) {
      throw discarded(context, uri, name, failure)
    } catch (failure: IllegalArgumentException) {
      throw discarded(context, uri, name, failure)
    }
  }

  private fun discarded(context: Context, uri: Uri, name: String, failure: Exception): PhoneFileNotReceived {
    context.contentResolver.delete(uri, null, null)
    return PhoneFileNotReceived(name, failure.message.orEmpty())
  }

  @RequiresApi(Build.VERSION_CODES.Q)
  private fun insert(context: Context, name: String, mime: String) = context.contentResolver.insert(
    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
    ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, name)
      put(MediaStore.MediaColumns.MIME_TYPE, mime)
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
  ) ?: throw PhoneFileNotReceived(name, "Android would not create the file in Downloads")
}
