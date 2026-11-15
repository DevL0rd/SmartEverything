package expo.modules.healthconnect.drive

import android.content.Context
import java.io.File
import java.io.IOException
import org.json.JSONArray
import org.json.JSONObject

class OfflineEntry(
  val itemId: String,
  val rev: Int,
  val bytes: Long,
  val name: String,
  val mime: String,
  val parentId: String?,
  val folder: Boolean,
)

object DriveOfflinePlan {
  fun needsFetch(held: OfflineEntry?, serverRev: Int): Boolean = held == null || held.rev != serverRev

  fun current(held: OfflineEntry?, knownRev: Int?): Boolean = held != null && (knownRev == null || held.rev == knownRev)

  fun surplus(held: Collection<String>, wanted: Set<String>): List<String> = held.filter { it !in wanted }

  fun fileName(itemId: String, rev: Int): String = "$itemId-$rev"
}

class DriveOfflineStore(context: Context) {
  private val directory = File(context.applicationContext.filesDir, DIRECTORY)
  private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun stagingFile(itemId: String): File {
    directory.mkdirs()
    return File(directory, "$itemId.part")
  }

  @Synchronized
  fun entry(itemId: String): OfflineEntry? = entries()[itemId]

  @Synchronized
  fun file(itemId: String): File? = entries()[itemId]?.let { File(directory, DriveOfflinePlan.fileName(it.itemId, it.rev)) }?.takeIf { it.isFile }

  @Synchronized
  fun all(): List<OfflineEntry> = entries().values.toList()

  @Synchronized
  fun usedBytes(): Long = entries().values.sumOf { it.bytes }

  @Synchronized
  fun put(entry: OfflineEntry, staged: File?) {
    val previous = entries()[entry.itemId]
    if (staged != null) {
      val target = File(directory, DriveOfflinePlan.fileName(entry.itemId, entry.rev))
      if (!staged.renameTo(target)) throw IOException("The offline copy of ${entry.name} could not be stored")
    }
    previous?.takeIf { !it.folder && it.rev != entry.rev }?.let { File(directory, DriveOfflinePlan.fileName(it.itemId, it.rev)).delete() }
    write(entries() + (entry.itemId to entry))
  }

  @Synchronized
  fun childrenOf(parentId: String): List<OfflineEntry> = entries().values.filter { it.parentId == parentId }

  @Synchronized
  fun topLevel(): List<OfflineEntry> = pins().mapNotNull { entries()[it] }

  @Synchronized
  fun remove(itemIds: Collection<String>) {
    val held = entries()
    itemIds.forEach { id -> held[id]?.let { File(directory, DriveOfflinePlan.fileName(it.itemId, it.rev)).delete() } }
    write(held - itemIds.toSet())
  }

  @Synchronized
  fun clear() {
    directory.listFiles()?.forEach { it.delete() }
    preferences.edit().clear().apply()
  }

  @Synchronized
  fun pins(): Set<String> = preferences.getStringSet(PINS, emptySet()).orEmpty().toSet()

  @Synchronized
  fun setPins(ids: Set<String>) {
    preferences.edit().putStringSet(PINS, ids).apply()
  }

  private fun entries(): Map<String, OfflineEntry> {
    val array = JSONArray(preferences.getString(ENTRIES, "[]"))
    return (0 until array.length()).map { array.getJSONObject(it) }.associate {
      it.getString("itemId") to OfflineEntry(
        it.getString("itemId"),
        it.getInt("rev"),
        it.getLong("bytes"),
        it.getString("name"),
        it.getString("mime"),
        it.optString("parentId").ifEmpty { null },
        it.getBoolean("folder"),
      )
    }
  }

  private fun write(entries: Map<String, OfflineEntry>) {
    val array = JSONArray()
    entries.values.forEach {
      array.put(
        JSONObject().put("itemId", it.itemId).put("rev", it.rev).put("bytes", it.bytes).put("name", it.name)
          .put("mime", it.mime).put("parentId", it.parentId ?: "").put("folder", it.folder)
      )
    }
    preferences.edit().putString(ENTRIES, array.toString()).apply()
  }

  private companion object {
    const val DIRECTORY = "drive-offline"
    const val PREFERENCES = "expo.modules.healthconnect.drive.offline"
    const val ENTRIES = "entries"
    const val PINS = "pins"
  }
}

class DriveConfig(context: Context) {
  private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun clientId(): String? = preferences.getString(CLIENT, null)

  fun configure(clientId: String): Boolean {
    val changed = clientId() != clientId
    preferences.edit().putString(CLIENT, clientId).apply()
    return changed
  }

  fun forget() {
    preferences.edit().clear().apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.drive.config"
    const val CLIENT = "clientId"
  }
}
