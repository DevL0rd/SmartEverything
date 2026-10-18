package expo.modules.healthconnect.phone

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import java.security.MessageDigest
import java.time.Instant
import org.json.JSONArray
import org.json.JSONObject

class ReportParts(val sections: Map<PhoneSection, JSONObject>, val lists: Map<String, JSONArray>) {
  fun isEmpty(): Boolean = sections.isEmpty() && lists.isEmpty()
}

object PhoneReporter {
  private const val WORK_NAME = "expo.modules.healthconnect.phone.report"
  private const val FEATURES = "features"
  private const val ACTIONS = "actions"
  private const val PERMISSIONS = "permissions"

  @Synchronized
  fun report(context: Context, events: List<PhoneEvent> = emptyList(), full: Boolean = false, slow: Boolean = full) {
    val store = PhoneStore(context)
    if (!store.enabled()) {
      return
    }
    val request = PhoneReadRequest(live = PhoneLive.active, slow = full || slow)
    val detail = PhoneDetailRegistry.read(context, request)
    val current = JSONObject(PhoneReadings.read(context, request) + detail.values + contextValues(store.context()))
    val sent = store.sent()
    val changed = if (full) current else changedValues(current, sent)
    val sentParts = store.sentParts()
    val parts = changedParts(ReportParts(detail.sections, lists(context)), sentParts, full)
    if (changed.length() == 0 && events.isEmpty() && parts.isEmpty()) {
      return
    }
    if (!enqueue(context, body(changed, events, parts))) {
      return
    }
    current.keys().forEach { sent.put(it, current.get(it)) }
    store.setSent(sent)
    remember(sentParts, parts)
    store.setSentParts(sentParts)
    PhoneEvents.emit("reported", "${changed.length()} values, ${parts.sections.size} sections, ${events.size} events")
  }

  fun forget(context: Context) {
    PhoneStore(context).forgetSent()
    val cancelled = WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
    PhoneBodyFiles.pruneUnreferenced(context, cancelled, graceMs = 0)
  }

  fun digest(text: String): String =
    MessageDigest.getInstance("SHA-256").digest(text.toByteArray()).joinToString("") { "%02x".format(it) }

  private fun body(changed: JSONObject, events: List<PhoneEvent>, parts: ReportParts): JSONObject {
    val report = JSONObject()
      .put("at", Instant.now().toString())
      .put("values", changed)
      .put("events", JSONArray(events.map { it.toJson() }))
    parts.lists.forEach { (name, list) -> report.put(name, list) }
    if (parts.sections.isNotEmpty()) {
      report.put("detail", JSONObject().also { detail -> parts.sections.forEach { (section, body) -> detail.put(section.wire, body) } })
    }
    return report
  }

  private fun changedParts(parts: ReportParts, sent: JSONObject, full: Boolean): ReportParts {
    val sections = parts.sections.filter { (section, body) -> full || sent.optString(section.wire) != digest(body.toString()) }
    val lists = parts.lists.filter { (name, list) -> full || sent.optString(name) != digest(list.toString()) }
    return ReportParts(sections, lists)
  }

  private fun remember(sent: JSONObject, parts: ReportParts) {
    parts.sections.forEach { (section, body) -> sent.put(section.wire, digest(body.toString())) }
    parts.lists.forEach { (name, list) -> sent.put(name, digest(list.toString())) }
  }

  private fun lists(context: Context): Map<String, JSONArray> = listOfNotNull(
    PhoneGuard.run("the feature list") { PhoneFeatures.read(context) }?.let { FEATURES to it },
    PhoneGuard.run("the action list") { PhoneMachine.actions(context) }?.let { ACTIONS to it },
    PhoneGuard.run("the permission list") { PhoneMachine.permissions(context) }?.let { PERMISSIONS to it }
  ).toMap()

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
        PhonePostWorker.reportRequest(context, report)
      )
      return true
    } catch (failure: IllegalStateException) {
      PhoneEvents.emit("report_not_queued", "The phone report could not be queued (${report.toString().length} characters): ${failure.message.orEmpty()}")
      return false
    }
  }
}
