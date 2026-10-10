package expo.modules.healthconnect

import android.content.Context
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

class IngestBatch(
  val records: List<JSONObject>,
  val deletions: List<String>,
  val grantedTypes: List<String>
)

class IngestClient(private val context: Context, target: IngestTarget) {
  private val hub = HubClient(target)

  suspend fun send(batch: IngestBatch): JSONObject = hub.post(
    INGEST_PATH,
    jsonOf(
      "records" to JSONArray(batch.records),
      "deletions" to JSONArray(batch.deletions),
      "grantedTypes" to JSONArray(batch.grantedTypes),
      "source" to source()
    )
  )

  private fun source(): JSONObject {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val version = info.versionName ?: throw AppVersionMissing(context.packageName)
    return jsonOf(
      "device" to "${Build.MANUFACTURER} ${Build.MODEL}".take(DEVICE_NAME_LIMIT),
      "appVersion" to version.take(APP_VERSION_LIMIT)
    )
  }

  private companion object {
    const val INGEST_PATH = "ingest"
    const val DEVICE_NAME_LIMIT = 120
    const val APP_VERSION_LIMIT = 40
  }
}
