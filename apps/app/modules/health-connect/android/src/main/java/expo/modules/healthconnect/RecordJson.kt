package expo.modules.healthconnect

import androidx.health.connect.client.records.Record
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

fun jsonOf(vararg entries: Pair<String, Any?>): JSONObject {
  val json = JSONObject()
  for ((key, value) in entries) {
    json.put(key, value ?: JSONObject.NULL)
  }
  return json
}

fun <T> jsonArrayOf(items: List<T>, describe: (T) -> JSONObject): JSONArray {
  val array = JSONArray()
  for (item in items) {
    array.put(describe(item))
  }
  return array
}

fun moment(instant: Instant): String = instant.toString()

object RecordJson {
  fun describe(type: RecordType, record: Record): JSONObject {
    val timing = RecordTiming.of(record)
    return jsonOf(
      "recordId" to record.metadata.id,
      "type" to type.name,
      "startTime" to moment(timing.start),
      "endTime" to timing.end?.let(::moment),
      "zoneOffsetSeconds" to timing.zoneOffset?.totalSeconds,
      "sourceApp" to record.metadata.dataOrigin.packageName,
      "lastModified" to moment(record.metadata.lastModifiedTime),
      "data" to dataOf(record)
    )
  }

  fun startOf(record: Record): Instant = RecordTiming.of(record).start

  private fun dataOf(record: Record): JSONObject =
    ActivityData.describe(record)
      ?: SessionData.describe(record)
      ?: BodyData.describe(record)
      ?: throw UnmappedValue("record", record)
}
