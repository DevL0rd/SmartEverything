package expo.modules.healthconnect

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteException
import android.database.sqlite.SQLiteOpenHelper
import java.time.Instant
import java.time.format.DateTimeParseException
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

class BleAdvertBatch(val ids: List<Long>, val adverts: JSONArray)

class BleOutboxFull : SyncFailure("The Bluetooth relay has 4096 unacknowledged frames; restore its server connection", retryable = false)

class BleOutboxUnavailable(cause: SQLiteException) : SyncFailure(
  "The Bluetooth relay could not access its durable outbox (${cause.javaClass.simpleName})",
  cause,
  retryable = true
)

class LegacyBleQueueInvalid(detail: String) : SyncFailure(
  "The saved Bluetooth preference queue could not be imported: $detail",
  retryable = false
)

object BleAdvertOutbox {
  private const val SENT_WINDOW_MS = 120_000L
  private const val CAPACITY = 4096L
  private const val BATCH_LIMIT = 50
  private var helper: Database? = null

  @Synchronized
  fun remember(context: Context, adverts: List<JSONObject>): Int = access(context) { database ->
    transaction(database) {
      database.delete("adverts", "acknowledged_at < ?", arrayOf((System.currentTimeMillis() - SENT_WINDOW_MS).toString()))
      var added = 0
      for (advert in adverts) {
        if (insert(database, advert)) added += 1
      }
      added
    }
  }

  @Synchronized
  fun peek(context: Context): BleAdvertBatch = access(context) { database ->
    val ids = mutableListOf<Long>()
    val adverts = JSONArray()
    database.rawQuery("select id, advert from adverts where acknowledged_at is null order by id limit $BATCH_LIMIT", null).use { rows ->
      while (rows.moveToNext()) {
        ids.add(rows.getLong(0))
        adverts.put(JSONObject(rows.getString(1)))
      }
    }
    BleAdvertBatch(ids, adverts)
  }

  @Synchronized
  fun acknowledge(context: Context, batch: BleAdvertBatch): Unit = access(context) { database ->
    transaction(database) {
      val values = ContentValues().apply { put("acknowledged_at", System.currentTimeMillis()) }
      for (id in batch.ids) {
        check(database.update("adverts", values, "id = ? and acknowledged_at is null", arrayOf(id.toString())) == 1) {
          "The acknowledged Bluetooth batch is no longer pending"
        }
      }
    }
  }

  @Synchronized
  fun pending(context: Context): Boolean = access(context) { pendingCount(it) > 0 }

  private fun <T> access(context: Context, use: (SQLiteDatabase) -> T): T {
    try {
      return use(database(context))
    } catch (failure: SQLiteException) {
      throw BleOutboxUnavailable(failure)
    }
  }

  private fun insert(database: SQLiteDatabase, advert: JSONObject, enforceCapacity: Boolean = true): Boolean {
    val identity = "${advert.getString("address")}:${advert.getString("serviceUuid")}:${advert.getString("data")}"
    database.rawQuery("select id from adverts where identity = ?", arrayOf(identity)).use { rows ->
      if (rows.moveToFirst()) return false
    }
    if (enforceCapacity && pendingCount(database) >= CAPACITY) throw BleOutboxFull()
    val values = ContentValues().apply {
      put("identity", identity)
      put("advert", advert.toString())
    }
    database.insertOrThrow("adverts", null, values)
    return true
  }

  private fun pendingCount(database: SQLiteDatabase): Long =
    database.rawQuery("select count(*) from adverts where acknowledged_at is null", null).use { rows ->
      check(rows.moveToFirst()) { "The Bluetooth outbox did not return its pending count" }
      rows.getLong(0)
    }

  private fun database(context: Context): SQLiteDatabase {
    val current = helper ?: Database(context.applicationContext).also { helper = it }
    val database = current.writableDatabase
    migrate(context, database)
    return database
  }

  private fun migrate(context: Context, database: SQLiteDatabase) {
    database.rawQuery("select name from migrations where name = 'preferences'", null).use { rows ->
      if (rows.moveToFirst()) return
    }
    val preferences = context.getSharedPreferences("expo.modules.healthconnect.scale-adverts", Context.MODE_PRIVATE)
    val adverts = legacyAdverts(preferences.getString("pending", "{}") ?: "{}")
    transaction(database) {
      for (advert in adverts) insert(database, advert, enforceCapacity = false)
      database.execSQL("insert into migrations (name) values ('preferences')")
    }
    check(preferences.edit().remove("pending").remove("sent").commit()) {
      "The migrated Bluetooth preference queue could not be cleared"
    }
  }

  private fun legacyAdverts(text: String): List<JSONObject> {
    try {
      val pending = JSONObject(text)
      return pending.keys().asSequence()
        .map { pending.getJSONObject(it) }
        .map { advert -> advert to legacyMoment(advert) }
        .sortedBy { it.second }
        .map { it.first }
        .toList()
    } catch (failure: JSONException) {
      throw LegacyBleQueueInvalid("expected a JSON object containing frame objects")
    }
  }

  private fun legacyMoment(advert: JSONObject): Instant {
    val value = advert.opt("seenAt")
    if (value !is String) {
      throw LegacyBleQueueInvalid("every frame must have a timestamp string")
    }
    try {
      return Instant.parse(value)
    } catch (failure: DateTimeParseException) {
      throw LegacyBleQueueInvalid("every frame timestamp must be a valid instant")
    }
  }

  private fun <T> transaction(database: SQLiteDatabase, write: () -> T): T {
    database.beginTransaction()
    try {
      val result = write()
      database.setTransactionSuccessful()
      return result
    } finally {
      database.endTransaction()
    }
  }

  private class Database(context: Context) : SQLiteOpenHelper(context, "bluetooth-relay.db", null, 1) {
    override fun onCreate(database: SQLiteDatabase) {
      database.execSQL("create table adverts (id integer primary key autoincrement, identity text not null unique, advert text not null, acknowledged_at integer)")
      database.execSQL("create index adverts_pending on adverts (acknowledged_at, id)")
      database.execSQL("create table migrations (name text primary key)")
    }

    override fun onUpgrade(database: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      error("Bluetooth relay database upgrade $oldVersion to $newVersion is unsupported")
    }
  }
}
