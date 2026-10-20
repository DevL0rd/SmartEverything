package expo.modules.healthconnect.toothbrush

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

class OutboxBatch(val id: Long, val deviceId: String, val body: String)

object BrushOutbox {
  private var helper: Database? = null

  @Synchronized
  fun remember(context: Context, deviceId: String, body: String) {
    val values = ContentValues().apply {
      put("device_id", deviceId)
      put("body", body)
    }
    database(context).insertOrThrow("batches", null, values)
  }

  @Synchronized
  fun peek(context: Context): OutboxBatch? =
    database(context).rawQuery("select id, device_id, body from batches order by id limit 1", null).use { rows ->
      if (rows.moveToFirst()) OutboxBatch(rows.getLong(0), rows.getString(1), rows.getString(2)) else null
    }

  @Synchronized
  fun acknowledge(context: Context, batch: OutboxBatch) {
    database(context).delete("batches", "id = ?", arrayOf(batch.id.toString()))
  }

  @Synchronized
  fun pending(context: Context): Boolean = peek(context) != null

  @Synchronized
  fun forget(context: Context, deviceId: String) {
    database(context).delete("batches", "device_id = ?", arrayOf(deviceId))
  }

  private fun database(context: Context): SQLiteDatabase {
    val current = helper ?: Database(context.applicationContext).also { helper = it }
    return current.writableDatabase
  }

  private class Database(context: Context) : SQLiteOpenHelper(context, "sonicare-relay.db", null, 1) {
    override fun onCreate(database: SQLiteDatabase) {
      database.execSQL("create table batches (id integer primary key autoincrement, device_id text not null, body text not null)")
    }

    override fun onUpgrade(database: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
      error("Toothbrush relay database upgrade $oldVersion to $newVersion is unsupported")
    }
  }
}
