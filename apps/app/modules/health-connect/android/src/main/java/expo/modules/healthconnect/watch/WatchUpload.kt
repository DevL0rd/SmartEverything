package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.jsonOf
import expo.modules.healthconnect.relayTarget
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

class UploadOutcome(val text: String, val keep: Set<String>)

object WatchUpload {
  private const val RECORD_BATCH = 400
  private const val SAMPLE_BATCH = 1500
  private const val ROUTE_BATCH = 10

  suspend fun upload(context: Context, deviceId: String, files: List<WatchFile>): UploadOutcome {
    val now = Instant.now()
    val records = files.flatMap { WatchRecords(deviceId, it, now).all() }
    val hub = HubClient(relayTarget(context))
    val path = "/api/watches/$deviceId/records"
    records.chunked(RECORD_BATCH).forEach { hub.post(path, body(records = it)) }
    sampleBatches(files).chunked(SAMPLE_BATCH / 50).forEach { hub.post(path, body(samples = it)) }
    val unmatched = routeBatches(files).chunked(ROUTE_BATCH).flatMap { batch ->
      val answer = hub.post(path, body(routes = batch.map { it.second }))
      val starts = answer.optJSONArray("unmatchedRoutes") ?: JSONArray()
      val missing = (0 until starts.length()).map { Instant.parse(starts.getString(it)) }.toSet()
      batch.filter { Instant.parse(it.second.getString("start")) in missing }.map { it.first }
    }.toSet()
    val health = healthConnect(context, records)
    val samples = files.sumOf { it.allSamples.size }
    val kept = if (unmatched.isEmpty()) "" else ", ${unmatched.size} GPS track(s) had no workout yet and stay on the watch"
    return UploadOutcome(
      "${files.size} file(s), ${records.size} record(s) and $samples stress/vitality reading(s) saved to your server$kept; $health",
      unmatched
    )
  }

  private fun body(
    records: List<JSONObject> = emptyList(),
    samples: List<JSONObject> = emptyList(),
    routes: List<JSONObject> = emptyList()
  ): JSONObject = jsonOf("records" to JSONArray(records), "samples" to JSONArray(samples), "routes" to JSONArray(routes))

  private fun sampleBatches(files: List<WatchFile>): List<JSONObject> = files.flatMap { file ->
    file.allSamples.groupBy { it.kind }.flatMap { (kind, samples) ->
      samples.chunked(50).map { chunk ->
        jsonOf(
          "kind" to kind.label,
          "zoneOffsetSeconds" to file.zoneOffsetSeconds,
          "samples" to JSONArray(chunk.map { jsonOf("time" to it.time.toString(), "value" to it.value) })
        )
      }
    }
  }

  private fun routeBatches(files: List<WatchFile>): List<Pair<String, JSONObject>> = files.flatMap { file ->
    file.routes.map { route ->
      file.key to jsonOf(
        "start" to route.start.toString(),
        "points" to JSONArray(route.points.map {
          jsonOf(
            "time" to it.time.toString(),
            "latitude" to it.latitude,
            "longitude" to it.longitude,
            "altitudeMeters" to it.altitudeMeters,
            "horizontalAccuracyMeters" to it.accuracyMeters
          )
        })
      )
    }
  }

  private suspend fun healthConnect(context: Context, records: List<JSONObject>): String = try {
    val report = WatchHealthWriter.write(context, records)
    report.skipped ?: buildString {
      append("${report.written} saved to Health Connect")
      if (report.missing.isNotEmpty()) append(", not allowed: ${report.missing.joinToString()}")
    }
  } catch (failure: SyncFailure) {
    "Health Connect refused: ${failure.message}"
  }
}
