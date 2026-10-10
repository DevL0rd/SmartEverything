package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.KeystoreBox
import org.json.JSONArray
import org.json.JSONObject

class CalendarEntry(
  val title: String,
  val description: String,
  val location: String,
  val startSeconds: Long,
  val endSeconds: Long,
  val allDay: Boolean,
  val remindMinutes: Int?
)

object WatchCalendar {
  private const val PREFERENCES = "expo.modules.healthconnect.watch-calendar"
  private const val KEY_ALIAS = "smarteverything-watch-calendar"
  private const val MAX_EVENTS = 50

  fun of(json: String): List<CalendarEntry> {
    val array = JSONArray(json)
    require(array.length() <= MAX_EVENTS) { "the watch takes at most $MAX_EVENTS calendar events" }
    return (0 until array.length()).map { entry(array.getJSONObject(it)) }
  }

  fun save(context: Context, json: String) {
    of(json)
    val sealed = KeystoreBox(KEY_ALIAS).seal(json)
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString("latest", sealed).apply()
  }

  fun latest(context: Context): List<CalendarEntry>? {
    val sealed = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("latest", null) ?: return null
    return of(KeystoreBox(KEY_ALIAS).open(sealed))
  }

  private fun entry(json: JSONObject) = CalendarEntry(
    json.getString("title"),
    json.getString("description"),
    json.getString("location"),
    json.getLong("start"),
    json.getLong("end"),
    json.getBoolean("allDay"),
    if (json.isNull("remindMinutes")) null else json.getInt("remindMinutes")
  )
}
