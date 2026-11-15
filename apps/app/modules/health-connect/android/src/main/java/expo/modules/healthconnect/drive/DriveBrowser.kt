package expo.modules.healthconnect.drive

import java.io.FileNotFoundException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class DriveBrowser(
  private val hub: DriveHub,
  private val cache: DriveProviderCache,
  private val clock: () -> Long = System::currentTimeMillis,
) {
  fun roots(): List<DriveRootDto> {
    val cached = cache.roots()
    if (cached.isNotEmpty()) return cached
    return refreshRoots()
  }

  fun refreshRoots(): List<DriveRootDto> {
    val fresh = runBlocking { hub.roots() }
    cache.saveRoots(fresh)
    return fresh
  }

  fun rootAccess(rootId: String): DriveAccess =
    roots().firstOrNull { it.id == rootId }?.let { DriveCacheRules.access(it) } ?: DriveAccess.VIEW

  fun accessOf(item: DriveItemDto, inherited: DriveAccess? = null): DriveAccess =
    inherited ?: cache.item(item.id)?.access ?: roots().firstOrNull { it.id == item.rootId }?.let { DriveCacheRules.access(it) }
      ?: item.parentId?.let { cache.item(it)?.access } ?: DriveAccess.VIEW

  fun item(itemId: String): CachedItem {
    cache.item(itemId)?.let { return it }
    return fetch(itemId)
  }

  fun fetch(itemId: String): CachedItem {
    val dto = runBlocking { hub.item(itemId) }
    val cached = dto.cached(accessOf(dto))
    cache.upsert(listOf(cached))
    return cached
  }

  fun children(id: DriveDocumentId): Pair<List<CachedItem>, Boolean> {
    val key = id.wire
    val loaded = cache.loadedAt(key)
    return cache.children(key) to DriveCacheRules.stale(loaded, clock())
  }

  fun loaded(id: DriveDocumentId): Boolean = cache.loadedAt(id.wire) != null

  fun refresh(id: DriveDocumentId) {
    when (id) {
      is DriveDocumentId.Drive -> loadFolder(id.wire, id.rootId, null, rootAccess(id.rootId))
      is DriveDocumentId.Item -> {
        val folder = fetch(id.itemId)
        loadFolder(id.wire, folder.rootId, folder.id, folder.access)
      }
      DriveDocumentId.SharedWithMe -> loadShared()
      DriveDocumentId.Offline -> Unit
    }
  }

  fun search(text: String, rootId: String): List<CachedItem> = runBlocking {
    val found = mutableListOf<CachedItem>()
    var cursor: String? = null
    do {
      val page = hub.search(text, rootId, cursor)
      found.addAll(page.items.map { it.cached(accessOf(it)) })
      cursor = page.next
    } while (cursor != null)
    cache.upsert(found)
    found
  }

  fun recents(): List<CachedItem> {
    val items = runBlocking { hub.recent(null) }.entries.mapNotNull { it.shown }.distinctBy { it.id }.map { it.cached(accessOf(it)) }
    cache.upsert(items)
    return items
  }

  fun createFolder(parentId: DriveDocumentId, name: String): String {
    val place = when (parentId) {
      is DriveDocumentId.Drive -> buildJsonObject { put("kind", "drive"); put("rootId", parentId.rootId) }
      is DriveDocumentId.Item -> buildJsonObject { put("kind", "folder"); put("folderId", parentId.itemId) }
      else -> throw FileNotFoundException("Nothing can be created here")
    }
    return change(buildJsonObject { put("action", "new_folder"); put("parent", place); put("name", name) })
  }

  fun rename(itemId: String, name: String): String =
    change(buildJsonObject { put("action", "rename"); put("itemId", itemId); put("name", name) })

  fun move(itemId: String, toFolderId: String): String = change(itemsChange("move", itemId, toFolderId))

  fun copy(itemId: String, toFolderId: String): String = change(itemsChange("copy", itemId, toFolderId))

  fun trash(itemId: String) {
    change(buildJsonObject { put("action", "trash"); put("itemIds", ids(itemId)) })
    cache.forget(itemId)
  }

  fun invalidate(keys: Collection<String>) = cache.invalidate(keys)

  fun parentKey(item: CachedItem): String = item.parentId?.let { DriveDocumentId.Item(it).wire } ?: DriveDocumentId.Drive(item.rootId).wire

  private fun itemsChange(action: String, itemId: String, toFolderId: String): JsonObject =
    buildJsonObject { put("action", action); put("itemIds", ids(itemId)); put("toFolderId", toFolderId) }

  private fun ids(itemId: String): JsonArray = buildJsonArray { add(JsonPrimitive(itemId)) }

  private fun change(body: JsonObject): String {
    val result = runBlocking { hub.change(body) }
    result.failed.firstOrNull()?.let { throw FileNotFoundException(it.reason) }
    result.conflicts.firstOrNull()?.let { throw FileNotFoundException("\"${it.name}\" already exists here") }
    val done = result.done.firstOrNull() ?: throw FileNotFoundException("The hub did not make the change")
    return done.resultItemId ?: done.itemId
  }

  private fun loadFolder(key: String, rootId: String, folderId: String?, access: DriveAccess) {
    val found = LinkedHashMap<String, CachedItem>()
    runBlocking {
      var cursor: String? = null
      do {
        val page = hub.browse(rootId, folderId, cursor)
        page.items.forEach { found[it.id] = it.cached(access) }
        page.shortcuts.mapNotNull { it.target.item }.forEach { target ->
          found.getOrPut(target.id) { target.cached(accessOf(target)) }
        }
        cursor = page.next
      } while (cursor != null)
    }
    cache.replaceListing(key, found.values.toList(), clock())
  }

  private fun loadShared() {
    val found = mutableListOf<CachedItem>()
    runBlocking {
      var cursor: String? = null
      do {
        val page = hub.shared(cursor)
        page.items.forEach { found.add(it.item.cached(DriveAccess.ofRole(it.grant.role))) }
        cursor = page.next
      } while (cursor != null)
    }
    cache.replaceListing(DriveDocumentId.SharedWithMe.wire, found, clock())
  }
}
