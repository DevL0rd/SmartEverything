package expo.modules.healthconnect.larq

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import expo.modules.healthconnect.HubJson

class LarqStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun save(bottles: List<PhoneBottle>) {
    preferences.edit().putString(BOTTLES, HubJson.encode(bottles)).apply()
  }

  fun bottles(): List<PhoneBottle> {
    val stored = preferences.getString(BOTTLES, null) ?: return emptyList()
    return HubJson.decode(stored)
  }

  fun byDevice(deviceId: String): PhoneBottle? = bottles().firstOrNull { it.deviceId == deviceId }

  fun bySerial(serial: String): PhoneBottle? = bottles().firstOrNull { it.serial.equals(serial, ignoreCase = true) }

  fun replacePlan(deviceId: String, plan: BottlePlan) {
    save(bottles().map { if (it.deviceId == deviceId) PhoneBottle(it.deviceId, it.serial, it.name, plan) else it })
  }

  companion object {
    private const val PREFERENCES = "expo.modules.healthconnect.larq"
    private const val BOTTLES = "bottles"
  }
}

class LarqBatch(val id: Long, val deviceId: String, val body: String)

object LarqOutbox {
  private var helper: Database? = null

  @Synchronized
  fun remember(context: Context, deviceId: String, body: String) {
    val values = ContentValues().apply {
      put("device_id", deviceId)
      put("body", body)
    }
    database(context).insertOrThrow("uploads", null, values)
  }

  @Synchronized
  fun peek(context: Context): LarqBatch? =
    database(context).rawQuery("select id, device_id, body from uploads order by id limit 1", null).use { rows ->
      if (rows.moveToFirst()) LarqBatch(rows.getLong(0), rows.getString(1), rows.getString(2)) else null
    }

  @Synchronized
  fun acknowledge(context: Context, batch: LarqBatch) {
    database(context).delete("uploads", "id = ?", arrayOf(batch.id.toString()))
  }

  @Synchronized
  fun pending(context: Context): Boolean = peek(context) != null

  @Synchronized
  fun forget(context: Context, deviceId: String) {
    database(context).delete("uploads", "device_id = ?", arrayOf(deviceId))
  }

  private fun database(context: Context): SQLiteDatabase {
    val current = helper ?: Database(context.applicationContext).also { helper = it }
    return current.writableDatabase
  }

  private class Database(context: Context) : SQLiteOpenHelper(context, "larq-relay.db", null, 1) {
    override fun onCreate(database: SQLiteDatabase) {
      database.execSQL("create table uploads (id integer primary key autoincrement, device_id text not null, body text not null)")
    }

    override fun onUpgrade(database: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      error("Bottle relay database upgrade $oldVersion to $newVersion is unsupported")
    }
  }
}
