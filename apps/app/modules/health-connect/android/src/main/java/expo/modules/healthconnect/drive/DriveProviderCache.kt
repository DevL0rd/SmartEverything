package expo.modules.healthconnect.drive

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

object DriveCacheRules {
  const val FRESH_MS = 30_000L

  fun stale(loadedAt: Long?, now: Long): Boolean = loadedAt == null || now - loadedAt >= FRESH_MS

  fun access(root: DriveRootDto): DriveAccess = if (root.scope == "home") DriveAccess.SHARED else DriveAccess.OWN
}

class DriveProviderCache(context: Context) : SQLiteOpenHelper(context.applicationContext, NAME, null, VERSION) {
  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL(
      "create table items (id text primary key, root_id text not null, parent_id text, name text not null, mime text, " +
        "folder integer not null, bytes integer not null, modified_ms integer not null, rev integer not null, " +
        "locked integer not null, access text not null, thumb integer not null)"
    )
    db.execSQL("create table listings (key text not null, position integer not null, item_id text not null, primary key (key, position))")
    db.execSQL("create table loaded (key text primary key, at_ms integer not null)")
    db.execSQL("create table roots (id text primary key, scope text not null, position integer not null)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    for (table in listOf("items", "listings", "loaded", "roots")) db.execSQL("drop table if exists $table")
    onCreate(db)
  }

  fun item(id: String): CachedItem? = readableDatabase.rawQuery("select $COLUMNS from items where id = ?", arrayOf(id)).use { first(it) }

  fun children(key: String): List<CachedItem> = readableDatabase.rawQuery(
    "select ${COLUMNS.split(", ").joinToString { "i.$it" }} from listings l join items i on i.id = l.item_id where l.key = ? order by l.position",
    arrayOf(key),
  ).use { all(it) }

  fun loadedAt(key: String): Long? = readableDatabase.rawQuery("select at_ms from loaded where key = ?", arrayOf(key)).use {
    if (it.moveToFirst()) it.getLong(0) else null
  }

  fun replaceListing(key: String, items: List<CachedItem>, now: Long) {
    val db = writableDatabase
    db.beginTransaction()
    try {
      items.forEach { store(db, it) }
      db.delete("listings", "key = ?", arrayOf(key))
      items.forEachIndexed { position, item ->
        db.insertOrThrow("listings", null, ContentValues().apply {
          put("key", key)
          put("position", position)
          put("item_id", item.id)
        })
      }
      db.insertWithOnConflict("loaded", null, ContentValues().apply {
        put("key", key)
        put("at_ms", now)
      }, SQLiteDatabase.CONFLICT_REPLACE)
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun upsert(items: List<CachedItem>) {
    val db = writableDatabase
    db.beginTransaction()
    try {
      items.forEach { store(db, it) }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun forget(id: String) {
    writableDatabase.delete("items", "id = ?", arrayOf(id))
    writableDatabase.delete("listings", "item_id = ?", arrayOf(id))
  }

  fun invalidate(keys: Collection<String>) {
    keys.forEach { writableDatabase.delete("loaded", "key = ?", arrayOf(it)) }
  }

  fun saveRoots(roots: List<DriveRootDto>) {
    val db = writableDatabase
    db.beginTransaction()
    try {
      db.delete("roots", null, null)
      roots.forEachIndexed { position, root ->
        db.insertOrThrow("roots", null, ContentValues().apply {
          put("id", root.id)
          put("scope", root.scope)
          put("position", position)
        })
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun roots(): List<DriveRootDto> = readableDatabase.rawQuery("select id, scope from roots order by position", null).use {
    buildList { while (it.moveToNext()) add(DriveRootDto(it.getString(0), it.getString(1))) }
  }

  fun clear() {
    for (table in listOf("items", "listings", "loaded", "roots")) writableDatabase.delete(table, null, null)
  }

  private fun store(db: SQLiteDatabase, item: CachedItem) {
    db.insertWithOnConflict("items", null, ContentValues().apply {
      put("id", item.id)
      put("root_id", item.rootId)
      put("parent_id", item.parentId)
      put("name", item.name)
      put("mime", item.mime)
      put("folder", if (item.folder) 1 else 0)
      put("bytes", item.bytes)
      put("modified_ms", item.modifiedMs)
      put("rev", item.rev)
      put("locked", if (item.locked) 1 else 0)
      put("access", item.access.wire)
      put("thumb", if (item.thumb) 1 else 0)
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }

  private fun first(cursor: Cursor): CachedItem? = if (cursor.moveToFirst()) read(cursor) else null

  private fun all(cursor: Cursor): List<CachedItem> = buildList { while (cursor.moveToNext()) add(read(cursor)) }

  private fun read(cursor: Cursor): CachedItem = CachedItem(
    id = cursor.getString(0),
    rootId = cursor.getString(1),
    parentId = cursor.getString(2),
    name = cursor.getString(3),
    mime = cursor.getString(4),
    folder = cursor.getInt(5) == 1,
    bytes = cursor.getLong(6),
    modifiedMs = cursor.getLong(7),
    rev = cursor.getInt(8),
    locked = cursor.getInt(9) == 1,
    access = DriveAccess.of(cursor.getString(10)),
    thumb = cursor.getInt(11) == 1,
  )

  private companion object {
    const val NAME = "drive-provider.db"
    const val VERSION = 1
    const val COLUMNS = "id, root_id, parent_id, name, mime, folder, bytes, modified_ms, rev, locked, access, thumb"
  }
}
