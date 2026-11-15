package expo.modules.healthconnect.drive

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.os.ParcelFileDescriptor
import android.os.storage.StorageManager
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.diagnostics.NativeLog
import java.io.File
import java.io.FileNotFoundException
import java.io.IOException
import kotlinx.coroutines.runBlocking

class DriveOpener(
  private val context: Context,
  private val hub: DriveHub,
  private val browser: DriveBrowser,
  private val store: DriveOfflineStore,
) {
  private val handler: Handler by lazy { Handler(HandlerThread("drive-transfer").apply { start() }.looper) }

  fun open(itemId: String, mode: String, changed: (String) -> Unit): ParcelFileDescriptor {
    val writing = mode.any { it == 'w' }
    val reading = mode == "r"
    val item = known(itemId)
    if (item != null && item.folder) throw FileNotFoundException("A folder cannot be opened as a file")
    if (item != null && !DriveDocumentFlags.opens(item.access, item.locked, writing)) {
      throw SecurityException(if (writing) "You can only view this file" else DriveDocumentFlags.VIEW_ONLY_REFUSAL)
    }
    return if (reading) read(itemId, item) else write(itemId, mode, changed)
  }

  fun thumbnail(itemId: String): File {
    val link = runBlocking { hub.links(listOf(itemId)) }.firstOrNull() ?: throw FileNotFoundException("The hub has no such file")
    val thumb = link.thumb ?: throw FileNotFoundException("The file has no thumbnail")
    val directory = File(context.cacheDir, THUMBS).apply { mkdirs() }
    val file = File(directory, "$itemId-${link.rev}")
    if (!file.isFile) {
      val staged = File(directory, "$itemId-${link.rev}.part")
      try {
        staged.outputStream().use { sink -> hub.raw().download(thumb.url, sink) { } }
        if (!staged.renameTo(file)) throw IOException("The thumbnail could not be stored")
      } finally {
        staged.delete()
      }
    }
    return file
  }

  fun createFile(parent: DriveDocumentId, name: String, mime: String): String {
    val target = when (parent) {
      is DriveDocumentId.Drive -> DriveTusTarget.Top(parent.rootId)
      is DriveDocumentId.Item -> DriveTusTarget.Folder(parent.itemId)
      else -> throw FileNotFoundException("Nothing can be created here")
    }
    val empty = File.createTempFile("drive-create", null, transferDirectory())
    try {
      return DriveTusUpload(hub.raw()).upload(target, name, mime, empty) { }.itemId
    } finally {
      empty.delete()
    }
  }

  private fun known(itemId: String): CachedItem? = try {
    browser.item(itemId)
  } catch (failure: IOException) {
    NativeLog.debug(SCOPE, "item.offline") { mapOf("type" to failure.javaClass.simpleName) }
    null
  } catch (failure: SyncFailure) {
    NativeLog.debug(SCOPE, "item.unreachable") { mapOf("type" to failure.javaClass.simpleName) }
    null
  }

  private fun read(itemId: String, item: CachedItem?): ParcelFileDescriptor {
    val held = store.entry(itemId)
    val offline = store.file(itemId)
    if (offline != null && DriveOfflinePlan.current(held, item?.rev)) {
      return ParcelFileDescriptor.open(offline, ParcelFileDescriptor.MODE_READ_ONLY)
    }
    if (item == null) {
      return offline?.let { ParcelFileDescriptor.open(it, ParcelFileDescriptor.MODE_READ_ONLY) }
        ?: throw FileNotFoundException("The file is not available offline")
    }
    return proxy(item)
  }

  private fun proxy(item: CachedItem): ParcelFileDescriptor {
    val links = LinkHolder(hub, item.id)
    val reader = DriveRangeReader(item.bytes) { start, end -> links.range(start, end) }
    val manager = context.getSystemService(StorageManager::class.java)
    return manager.openProxyFileDescriptor(ParcelFileDescriptor.MODE_READ_ONLY, DriveProxyCallback(reader) { }, handler)
  }

  private fun write(itemId: String, mode: String, changed: (String) -> Unit): ParcelFileDescriptor {
    val fresh = browser.fetch(itemId)
    if (!fresh.access.writes) throw SecurityException("You can only view this file")
    val staged = File.createTempFile("drive-write", null, transferDirectory())
    if (DriveWriteSeed.keepsExisting(mode)) {
      staged.outputStream().use { sink -> hub.raw().download(DriveExport.url(hub, itemId), sink) { } }
    }
    return ParcelFileDescriptor.open(staged, ParcelFileDescriptor.parseMode(mode), handler) { failure ->
      try {
        if (failure == null) {
          DriveTusUpload(hub.raw()).upload(DriveTusTarget.Replace(itemId, fresh.rev), fresh.name, fresh.mime, staged) { }
          changed(browser.parentKey(fresh))
        } else {
          NativeLog.warn(SCOPE, "write.abandoned", failure) { mapOf("type" to failure.javaClass.simpleName) }
        }
      } catch (rejected: SyncFailure) {
        NativeLog.error(SCOPE, "write.not_saved", rejected) { mapOf("type" to rejected.javaClass.simpleName) }
      } catch (broken: IOException) {
        NativeLog.error(SCOPE, "write.not_saved", broken) { mapOf("type" to broken.javaClass.simpleName) }
      } finally {
        staged.delete()
      }
    }
  }

  private fun transferDirectory(): File = File(context.cacheDir, TRANSFERS).apply { mkdirs() }

  private class LinkHolder(private val hub: DriveHub, private val itemId: String) {
    @Volatile private var url: String? = null

    fun range(start: Long, end: Long): ByteArray {
      try {
        return hub.raw().range(current(), start, end)
      } catch (refused: DriveLinkRefused) {
        NativeLog.debug(SCOPE, "link.renewed") { mapOf("status" to refused.status) }
        url = null
        return hub.raw().range(current(), start, end)
      }
    }

    private fun current(): String = url ?: DriveExport.url(hub, itemId).also { url = it }
  }

  private companion object {
    const val SCOPE = "drive-opener"
    const val THUMBS = "drive-thumbs"
    const val TRANSFERS = "drive-transfers"
  }
}

object DriveWriteSeed {
  fun keepsExisting(mode: String): Boolean = !mode.contains('t') && (mode.contains('r') || mode.contains('a'))
}

object DriveExport {
  fun url(hub: DriveHub, itemId: String): String {
    val link = runBlocking { hub.links(listOf(itemId)) }.firstOrNull() ?: throw FileNotFoundException("The hub has no such file")
    return link.download?.url ?: throw SecurityException(DriveDocumentFlags.VIEW_ONLY_REFUSAL)
  }
}
