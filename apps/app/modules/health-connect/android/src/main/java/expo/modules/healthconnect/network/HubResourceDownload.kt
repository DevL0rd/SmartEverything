package expo.modules.healthconnect.network

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import androidx.core.content.FileProvider
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import java.io.Serializable
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import org.json.JSONObject

class HubResourceSave(val mime: String, val name: String) : Serializable
class HubResourceSaveContract : AppContextActivityResultContract<HubResourceSave, Uri?> {
  override fun createIntent(context: Context, input: HubResourceSave): Intent = Intent(Intent.ACTION_CREATE_DOCUMENT)
    .addCategory(Intent.CATEGORY_OPENABLE).setType(input.mime).putExtra(Intent.EXTRA_TITLE, input.name)
  override fun parseResult(input: HubResourceSave, resultCode: Int, intent: Intent?): Uri? =
    if (resultCode == Activity.RESULT_OK) intent?.data else null
}

class HubResourceDownload(private val context: Context, private val broker: HubResourceBroker) {
  var launcher: AppContextActivityResultLauncher<HubResourceSave, Uri?>? = null
  private var busy = false
  suspend fun download(json: String, activity: () -> Activity?): String {
    val input = JSONObject(json)
    require(input.length() == 2 && input.getString("intent") in listOf("open", "save"))
    synchronized(this) { require(!busy) { "A resource action is already pending" }; busy = true }
    var downloaded: HubResourceFile? = null
    try {
      val grant = broker.grants.get(input.getString("id"))
      withContext(Dispatchers.Main) { visible(activity) }
      val file = withContext(broker.io.asCoroutineDispatcher()) { HubResourceFiles.fetch(context, grant, broker.grants) }
      downloaded = file
      if (input.getString("intent") == "open") return withContext(Dispatchers.Main) {
        open(grant, file, visible(activity)); file.shared = true; "completed"
      }
      return save(grant, file, activity)
    } finally {
      try { downloaded?.let { if (!it.shared) HubResourceFiles.delete(it.file) } }
      finally { synchronized(this) { busy = false } }
    }
  }
  private fun visible(activity: () -> Activity?): Activity {
    val current = activity() ?: error("Open or save a resource from the visible app")
    require(!current.isFinishing && !current.isDestroyed && current.hasWindowFocus())
    return current
  }
  private fun open(grant: HubResourceGrant, file: HubResourceFile, activity: Activity) {
    grant.check()
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.hub.resources", file.file)
    file.withdrawalKey = uri.toString()
    file.withdrawPermission = { context.revokeUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
    grant.onWithdraw(uri.toString()) { file.withdrawPermission?.invoke() }
    val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, file.mime)
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION).apply { clipData = ClipData.newRawUri(file.name, uri) }
    activity.startActivity(Intent.createChooser(intent, file.name).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
  }
  private suspend fun save(grant: HubResourceGrant, file: HubResourceFile, activity: () -> Activity?): String {
    val picker = launcher ?: error("Android document picker is unavailable")
    val uri = withContext(Dispatchers.Main) { visible(activity); grant.check(); picker.launch(HubResourceSave(file.mime, file.name)) }
      ?: return "cancelled"
    try {
      withContext(broker.io.asCoroutineDispatcher()) { persist(grant, file, uri) }
      return "completed"
    } catch (failure: Exception) {
      if (!DocumentsContract.deleteDocument(context.contentResolver, uri)) throw IOException("Could not clean up incomplete saved resource", failure)
      throw failure
    }
  }
  private fun persist(grant: HubResourceGrant, file: HubResourceFile, uri: Uri) {
    require(uri.scheme == "content") { "Document picker returned an unsupported destination" }
    val output = context.contentResolver.openOutputStream(uri, "wt") ?: throw IOException("Android document destination cannot be opened")
    output.use { destination -> file.file.inputStream().use { source ->
      val bytes = ByteArray(32768)
      while (true) {
        grant.check()
        val count = source.read(bytes)
        if (count < 0) break
        grant.check()
        destination.write(bytes, 0, count)
      }
      grant.check(); destination.flush()
    } }
  }
}
