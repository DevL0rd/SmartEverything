package expo.modules.healthconnect.watch

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import expo.modules.healthconnect.HealthConnectAccess
import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import kotlin.reflect.KClass

class WatchWriteReport(
  val written: Int,
  val missing: List<String>,
  val skipped: String?,
  val failed: List<RecordFailure> = emptyList(),
  val withoutStages: List<String> = emptyList(),
  val refused: List<BatchRefusal> = emptyList()
)

class BatchRefusal(val recordIds: List<String>, val types: List<String>, val reason: String)

object WatchHealthWriter {
  private val TYPES: Map<String, KClass<out Record>> = mapOf(
    "Steps" to StepsRecord::class,
    "Distance" to DistanceRecord::class,
    "ActiveCaloriesBurned" to ActiveCaloriesBurnedRecord::class,
    "HeartRate" to HeartRateRecord::class,
    "OxygenSaturation" to OxygenSaturationRecord::class,
    "RestingHeartRate" to RestingHeartRateRecord::class,
    "SleepSession" to SleepSessionRecord::class,
    "ExerciseSession" to ExerciseSessionRecord::class
  )

  val writePermissions: Set<String> = TYPES.values.map { HealthPermission.getWritePermission(it) }.toSet()

  suspend fun write(context: Context, records: List<HealthEnvelope>): WatchWriteReport {
    if (!HealthConnectAccess.connected(context)) {
      return WatchWriteReport(0, emptyList(), "Health Connect is not set up on this phone")
    }
    val client = HealthConnectAccess.client(context)
    val granted = HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
    val allowed = TYPES.filterValues { HealthPermission.getWritePermission(it) in granted }.keys
    val built = WatchRecordBuilder.build(records.filter { it.type in allowed })
    logBuilt(built)
    val refused = mutableListOf<BatchRefusal>()
    var written = 0
    built.records.chunked(BATCH).forEach { batch ->
      try {
        HealthConnectAccess.call { client.insertRecords(batch) }
        written += batch.size
      } catch (failure: SyncFailure) {
        refused.add(refusal(batch, failure))
      } catch (failure: IllegalArgumentException) {
        refused.add(refusal(batch, failure))
      }
    }
    val missing = records.map { it.type }.distinct().filter { it !in allowed }
    return WatchWriteReport(written, missing, null, built.failures, built.withoutStages, refused)
  }

  private fun refusal(batch: List<Record>, cause: Exception): BatchRefusal =
    BatchRefusal(
      batch.mapNotNull { it.metadata.clientRecordId?.removePrefix(CLIENT_ID_PREFIX) },
      batch.map { it::class.simpleName.orEmpty() }.distinct(),
      "${cause.javaClass.simpleName}: ${cause.message}"
    )

  suspend fun granted(client: HealthConnectClient): Boolean =
    HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }.containsAll(writePermissions)

  private fun logBuilt(built: BuiltRecords) {
    built.trims.forEach { trim ->
      NativeLog.warn(SCOPE, "sleep.stages_repaired") { mapOf("record" to trim.recordId, "changes" to trim.changes.size, "stagesRemoved" to trim.stagesRemoved, "detail" to trim.changes.joinToString("; ")) }
    }
    built.failures.forEach { failure ->
      NativeLog.error(SCOPE, "record.unbuildable") { mapOf("record" to failure.recordId, "type" to failure.type, "reason" to failure.reason) }
    }
  }

  const val CLIENT_ID_PREFIX = "se-"
  private const val SCOPE = "watch-health"
  private const val BATCH = 200
}
