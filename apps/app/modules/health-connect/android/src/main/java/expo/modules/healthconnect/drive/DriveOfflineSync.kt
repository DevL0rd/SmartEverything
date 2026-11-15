package expo.modules.healthconnect.drive

import expo.modules.healthconnect.IngestRejected
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.job
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.coroutines.coroutineContext

class OfflineOutcome(val itemId: String, val rev: Int, val bytes: Long, val error: String?)

object DriveOfflineReport {
  fun entries(outcomes: List<OfflineOutcome>): JsonArray = buildJsonArray {
    outcomes.forEach { outcome ->
      add(
        buildJsonObject {
          put("itemId", outcome.itemId)
          if (outcome.error == null) {
            put("state", "ready")
            put("bytes", outcome.bytes)
            put("rev", outcome.rev)
          } else {
            put("state", "failed")
            put("error", outcome.error)
          }
        }
      )
    }
  }
}

class DriveOfflineSync(
  private val hub: DriveHub,
  private val store: DriveOfflineStore,
  private val cache: DriveProviderCache,
  private val config: DriveConfig,
) {
  suspend fun run() {
    val clientId = config.clientId() ?: return
    val pins = pinned(clientId)
    store.setPins(pins.toSet())
    val ownRoots = cache.roots().map { it.id }.toSet().ifEmpty { hub.roots().also { cache.saveRoots(it) }.map { it.id }.toSet() }
    val wanted = mutableSetOf<String>()
    val outcomes = pins.map { pin -> outcome(pin, ownRoots, wanted) }
    store.remove(DriveOfflinePlan.surplus(store.all().map { it.itemId }, wanted))
    if (outcomes.isNotEmpty()) hub.reportOffline(clientId, DriveOfflineReport.entries(outcomes))
  }

  private suspend fun pinned(clientId: String): List<String> {
    val ids = mutableListOf<String>()
    var cursor: String? = null
    do {
      val page = hub.offline(clientId, cursor)
      page.items.forEach { ids.add(it.itemId) }
      cursor = page.next
    } while (cursor != null)
    return ids
  }

  private suspend fun outcome(pinId: String, ownRoots: Set<String>, wanted: MutableSet<String>): OfflineOutcome {
    coroutineContext.ensureActive()
    return try {
      val pin = hub.item(pinId)
      var bytes = 0L
      walk(pin, ownRoots).forEach { item ->
        wanted.add(item.id)
        bytes += if (item.folder) remember(item) else keep(item)
      }
      OfflineOutcome(pinId, pin.rev, bytes, null)
    } catch (failure: IngestRejected) {
      OfflineOutcome(pinId, 0, 0, failure.message.orEmpty())
    } catch (failure: DriveLinkRefused) {
      OfflineOutcome(pinId, 0, 0, failure.message.orEmpty())
    }
  }

  private suspend fun walk(pin: DriveItemDto, ownRoots: Set<String>): List<DriveItemDto> {
    val found = mutableListOf<DriveItemDto>()
    val pending = ArrayDeque(listOf(pin))
    while (pending.isNotEmpty()) {
      coroutineContext.ensureActive()
      val item = pending.removeFirst()
      if (!item.folder) {
        if (!item.locked || item.rootId in ownRoots) found.add(item)
        continue
      }
      found.add(item)
      var cursor: String? = null
      do {
        val page = hub.browse(item.rootId, item.id, cursor)
        pending.addAll(page.items)
        cursor = page.next
      } while (cursor != null)
    }
    return found
  }

  private fun remember(folder: DriveItemDto): Long {
    store.put(OfflineEntry(folder.id, folder.rev, 0, folder.name, android.provider.DocumentsContract.Document.MIME_TYPE_DIR, folder.parentId, true), null)
    return 0
  }

  private suspend fun keep(file: DriveItemDto): Long {
    val held = store.entry(file.id)
    if (!DriveOfflinePlan.needsFetch(held, file.rev) && store.file(file.id) != null) return file.bytes
    val link = hub.links(listOf(file.id)).first()
    val job = coroutineContext.job
    val staged = store.stagingFile(file.id)
    try {
      val bytes = staged.outputStream().use { sink -> hub.raw().download(link.file.url, sink) { job.ensureActive() } }
      coroutineContext.ensureActive()
      store.put(OfflineEntry(file.id, link.rev, bytes, file.name, file.mime ?: DEFAULT_MIME, file.parentId, false), staged)
      return bytes
    } finally {
      staged.delete()
    }
  }

  private companion object {
    const val DEFAULT_MIME = "application/octet-stream"
  }
}
