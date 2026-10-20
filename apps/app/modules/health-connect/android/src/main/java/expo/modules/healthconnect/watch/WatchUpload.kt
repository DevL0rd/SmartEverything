package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.relayTarget
import java.time.Instant

class UploadOutcome(val text: String, val keep: Set<String>)

private class HealthOutcome(
  val text: String,
  val failed: List<RecordFailure>,
  val withoutStages: List<String>,
  val refused: List<BatchRefusal>,
  val refusedAll: Boolean = false
)

object AckDecision {
  fun keep(
    fileOf: Map<String, String>,
    allFiles: Set<String>,
    unmatchedRoutes: Set<String>,
    unbuildable: List<String>,
    withoutStages: List<String>,
    refused: List<String>,
    refusedAll: Boolean
  ): Set<String> {
    val unwritten = (unbuildable + withoutStages + refused).mapNotNull { fileOf[it] }.toSet()
    return unmatchedRoutes + unwritten + if (refusedAll) allFiles else emptySet()
  }

  fun acknowledge(parsed: List<String>, keep: Set<String>, holding: Set<String>): List<String> =
    parsed.filter { it !in keep && it !in holding }
}

object WatchUpload {
  private const val SCOPE = "watch-upload"
  private const val RECORD_BATCH = 400
  private const val SAMPLE_BATCH = 1500
  private const val ROUTE_BATCH = 10
  private const val SAMPLES_PER_BATCH = 50

  suspend fun upload(context: Context, deviceId: String, files: List<WatchFile>): UploadOutcome {
    val now = Instant.now()
    val byFile = files.map { file -> file.key to WatchRecords(deviceId, file, now).all() }
    val records = byFile.flatMap { it.second }
    val hub = HubClient(relayTarget(context))
    val path = "/api/watches/$deviceId/records"
    records.chunked(RECORD_BATCH).forEach { hub.submit(path, WatchRecordsRequest(it)) }
    sampleBatches(files).chunked(SAMPLE_BATCH / SAMPLES_PER_BATCH).forEach {
      hub.submit(path, WatchRecordsRequest(emptyList(), samples = it))
    }
    val unmatched = routeBatches(files).chunked(ROUTE_BATCH).flatMap { batch ->
      val answer = hub.post<WatchRecordsRequest, WatchRecordsSaved>(
        path,
        WatchRecordsRequest(emptyList(), routes = batch.map { it.second })
      )
      val missing = answer.unmatchedRoutes.toSet()
      batch.filter { it.second.start in missing }.map { it.first }
    }.toSet()
    val health = healthConnect(context, records)
    val fileOf = byFile.flatMap { (key, list) -> list.map { it.recordId to key } }.toMap()
    health.refused.forEach { refusal -> logRefusal(refusal, refusal.recordIds.mapNotNull { fileOf[it] }.toSet()) }
    if (health.refusedAll) logRefusal(BatchRefusal(records.map { it.recordId }, records.map { it.type }.distinct(), health.text), files.map { it.key }.toSet())
    val keep = AckDecision.keep(
      fileOf,
      files.map { it.key }.toSet(),
      unmatched,
      health.failed.map { it.recordId },
      health.withoutStages,
      health.refused.flatMap { it.recordIds },
      health.refusedAll
    )
    val samples = files.sumOf { it.allSamples.size }
    val kept = if (unmatched.isEmpty()) "" else ", ${unmatched.size} GPS track(s) had no workout yet and stay on the watch"
    return UploadOutcome(
      "${files.size} file(s), ${records.size} record(s) and $samples stress/vitality reading(s) saved to your server$kept; ${health.text}",
      keep
    )
  }

  private fun sampleBatches(files: List<WatchFile>): List<SampleBatchWire> = files.flatMap { file ->
    file.allSamples.groupBy { it.kind }.flatMap { (kind, samples) ->
      samples.chunked(SAMPLES_PER_BATCH).map { chunk ->
        SampleBatchWire(kind.label, file.zoneOffsetSeconds, chunk.map { SampleWire(it.time, it.value) })
      }
    }
  }

  private fun routeBatches(files: List<WatchFile>): List<Pair<String, RouteWire>> = files.flatMap { file ->
    file.routes.map { route ->
      file.key to RouteWire(
        route.start,
        route.points.map {
          RoutePointWire(it.time, it.latitude, it.longitude, it.altitudeMeters, it.accuracyMeters)
        }
      )
    }
  }

  private suspend fun healthConnect(context: Context, records: List<HealthEnvelope>): HealthOutcome = try {
    val report = WatchHealthWriter.write(context, records)
    HealthOutcome(report.skipped ?: healthText(report), report.failed, report.withoutStages, report.refused)
  } catch (failure: SyncFailure) {
    HealthOutcome("Health Connect refused: ${failure.message}; the file(s) stay on the watch for the next sync", emptyList(), emptyList(), emptyList(), refusedAll = true)
  }

  private fun logRefusal(refusal: BatchRefusal, fileKeys: Set<String>) {
    NativeLog.error(SCOPE, "records.refused") {
      mapOf("reason" to refusal.reason, "types" to refusal.types.joinToString(), "records" to refusal.recordIds.size, "files" to fileKeys.joinToString())
    }
  }

  private fun healthText(report: WatchWriteReport): String = buildString {
    append("${report.written} saved to Health Connect")
    if (report.missing.isNotEmpty()) append(", not allowed: ${report.missing.joinToString()}")
    if (report.failed.isNotEmpty()) {
      append(", ${report.failed.size} record(s) are invalid and their file(s) stay on the watch: ")
      append(report.failed.joinToString("; ") { "${it.type} ${it.reason}" })
    }
    if (report.refused.isNotEmpty()) {
      append(", Health Connect refused ${report.refused.sumOf { it.recordIds.size }} record(s) and their file(s) stay on the watch: ")
      append(report.refused.joinToString("; ") { it.reason })
    }
    if (report.withoutStages.isNotEmpty()) append(", ${report.withoutStages.size} night(s) saved without stages and kept on the watch")
  }
}
