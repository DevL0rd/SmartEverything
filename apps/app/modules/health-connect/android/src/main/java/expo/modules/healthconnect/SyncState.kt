package expo.modules.healthconnect

import android.content.Context
import java.time.Instant
import org.json.JSONObject

class ChangesCursor(val token: String, val syncedAt: Instant)

class SyncState(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun changes(type: RecordType): ChangesCursor? {
    val token = preferences.getString("changes.${type.name}", null) ?: return null
    val syncedAt = preferences.getString("synced.${type.name}", null) ?: return null
    return ChangesCursor(token, Instant.parse(syncedAt))
  }

  fun pendingToken(type: RecordType): String? = preferences.getString("pending.${type.name}", null)

  fun backfillCursor(type: RecordType): Instant? =
    preferences.getString("cursor.${type.name}", null)?.let(Instant::parse)

  fun beginBackfill(type: RecordType, token: String) {
    preferences.edit().putString("pending.${type.name}", token).commit()
  }

  fun advanceBackfill(type: RecordType, cursor: Instant) {
    preferences.edit().putString("cursor.${type.name}", cursor.toString()).commit()
  }

  fun acceptChanges(type: RecordType, token: String, at: Instant) {
    preferences.edit()
      .putString("changes.${type.name}", token)
      .putString("synced.${type.name}", at.toString())
      .remove("pending.${type.name}")
      .remove("cursor.${type.name}")
      .commit()
  }

  fun saveReport(report: SyncReport) {
    preferences.edit().putString(REPORT, report.toJson().toString()).commit()
  }

  fun lastReport(): SyncReport? =
    preferences.getString(REPORT, null)?.let { SyncReport.fromJson(JSONObject(it)) }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.sync"
    const val REPORT = "report"
  }
}
