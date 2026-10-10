package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

object PhoneReporter {
  private const val WORK_NAME = "expo.modules.healthconnect.phone.report"

  @Synchronized
  fun report(context: Context, events: List<PhoneEvent> = emptyList(), full: Boolean = false, screenTime: Boolean = full) {
    val store = PhoneStore(context)
    if (!store.enabled()) {
      return
    }
    val current = JSONObject(PhoneReadings.read(context, screenTime) + contextValues(store.context()))
    val sent = store.sent()
    val changed = if (full) current else changedValues(current, sent)
    if (changed.length() == 0 && events.isEmpty()) {
      return
    }
    val report = JSONObject()
      .put("at", Instant.now().toString())
      .put("values", changed)
      .put("events", JSONArray(events.map { it.toJson() }))
    if (!enqueue(context, report)) {
      return
    }
    current.keys().forEach { sent.put(it, current.get(it)) }
    store.setSent(sent)
    PhoneEvents.emit("reported", "${changed.length()} values, ${events.size} events")
  }

  fun forget(context: Context) {
    PhoneStore(context).setSent(JSONObject())
    WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
  }

  private fun contextValues(snapshot: PhoneContextSnapshot): Map<String, Any?> = mapOf(
    "phone_context" to snapshot.state.wire,
    "context_confidence" to snapshot.confidence,
    "place" to snapshot.place
  )

  private fun changedValues(current: JSONObject, sent: JSONObject): JSONObject {
    val changed = JSONObject()
    current.keys().forEach { key ->
      val value = current.get(key)
      if (!sent.has(key) || sent.get(key).toString() != value.toString()) {
        changed.put(key, value)
      }
    }
    return changed
  }

  private fun enqueue(context: Context, report: JSONObject): Boolean {
    try {
      WorkManager.getInstance(context).enqueueUniqueWork(
        WORK_NAME,
        ExistingWorkPolicy.APPEND_OR_REPLACE,
        PhonePostWorker.request(PhonePostWorker.REPORT_PATH, report)
      )
      return true
    } catch (failure: IllegalStateException) {
      PhoneEvents.emit("report_not_queued", "The phone report is too large to queue (${report.toString().length} characters): ${failure.message.orEmpty()}")
      return false
    }
  }
}
