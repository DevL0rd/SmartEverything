package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.relayTarget
import java.time.Instant

class UploadOutcome(val text: String, val keep: Set<String>)

object WatchUpload {
  private const val RECORD_BATCH = 400
  private const val SAMPLE_BATCH = 1500
  private const val ROUTE_BATCH = 10
  private const val SAMPLES_PER_BATCH = 50

  suspend fun upload(context: Context, deviceId: String, files: List<WatchFile>): UploadOutcome {
    val now = Instant.now()
    val records = files.flatMap { WatchRecords(deviceId, it, now).all() }
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
    val samples = files.sumOf { it.allSamples.size }
    val kept = if (unmatched.isEmpty()) "" else ", ${unmatched.size} GPS track(s) had no workout yet and stay on the watch"
    return UploadOutcome(
      "${files.size} file(s), ${records.size} record(s) and $samples stress/vitality reading(s) saved to your server$kept; $health",
      unmatched
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

  private suspend fun healthConnect(context: Context, records: List<HealthEnvelope>): String = try {
    val report = WatchHealthWriter.write(context, records)
    report.skipped ?: buildString {
      append("${report.written} saved to Health Connect")
      if (report.missing.isNotEmpty()) append(", not allowed: ${report.missing.joinToString()}")
    }
  } catch (failure: SyncFailure) {
    "Health Connect refused: ${failure.message}"
  }
}
