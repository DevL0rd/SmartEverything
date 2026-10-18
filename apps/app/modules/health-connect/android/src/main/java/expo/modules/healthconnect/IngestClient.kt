package expo.modules.healthconnect

import android.content.Context
import android.os.Build
import kotlinx.serialization.Serializable

class IngestBatch(
  val records: List<HealthEnvelope>,
  val deletions: List<String>,
  val grantedTypes: List<String>
)

@Serializable
class IngestSource(val device: String, val appVersion: String)

@Serializable
class IngestRequest(
  val records: List<HealthEnvelope>,
  val deletions: List<String>,
  val grantedTypes: List<String>,
  val source: IngestSource
)

class IngestClient(private val context: Context, target: IngestTarget) {
  private val hub = HubClient(target)

  suspend fun send(batch: IngestBatch) {
    hub.submit(INGEST_PATH, IngestRequest(batch.records, batch.deletions, batch.grantedTypes, source()))
  }

  private fun source(): IngestSource {
    val info = context.packageManager.getPackageInfo(context.packageName, 0)
    val version = info.versionName ?: throw AppVersionMissing(context.packageName)
    return IngestSource("${Build.MANUFACTURER} ${Build.MODEL}", version)
  }

  private companion object {
    const val INGEST_PATH = "/api/health/ingest"
  }
}
