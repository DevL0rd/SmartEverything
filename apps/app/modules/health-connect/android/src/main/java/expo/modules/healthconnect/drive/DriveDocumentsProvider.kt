package expo.modules.healthconnect.drive

import android.content.Context
import android.content.res.AssetFileDescriptor
import android.database.Cursor
import android.database.MatrixCursor
import android.graphics.Point
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.provider.DocumentsContract.Root
import android.provider.DocumentsProvider
import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.diagnostics.NativeLog
import java.io.FileNotFoundException
import java.util.concurrent.Executors
import java.util.concurrent.ConcurrentHashMap

class DriveDocumentsProvider : DocumentsProvider() {
  private val ctx: Context get() = requireNotNull(context) { "The drive provider runs inside the app" }
  private val hub by lazy { DriveHub(ctx) }
  private val cache by lazy { DriveProviderCache(ctx) }
  private val store by lazy { DriveOfflineStore(ctx) }
  internal var browserFactory: () -> DriveBrowser = { DriveBrowser(hub, cache) }
  private val browser by lazy { browserFactory() }
  private val opener by lazy { DriveOpener(ctx, hub, browser, store) }
  private val background = Executors.newSingleThreadExecutor { Thread(it, "drive-provider").apply { isDaemon = true } }
  private val refreshing = ConcurrentHashMap.newKeySet<String>()

  override fun onCreate(): Boolean = true

  override fun queryRoots(projection: Array<String>?): Cursor {
    val cursor = MatrixCursor(projection ?: ROOT_COLUMNS)
    if (!Credentials(ctx).configured()) return cursor
    val roots = guarded("roots") { browser.roots() }
    roots.forEach { root ->
      val wire = DriveDocumentId.Drive(root.id).wire
      root(cursor, wire, if (root.scope == "home") "Shared Drive" else "My Drive", DRIVE_ROOT_FLAGS)
    }
    root(cursor, DriveDocumentId.SharedWithMe.wire, "Shared with me", Root.FLAG_SUPPORTS_IS_CHILD)
    root(cursor, DriveDocumentId.Offline.wire, "Offline", Root.FLAG_SUPPORTS_IS_CHILD or Root.FLAG_LOCAL_ONLY)
    cursor.setNotificationUri(ctx.contentResolver, DriveAuthority.rootsUri(ctx))
    return cursor
  }

  override fun queryDocument(documentId: String, projection: Array<String>?): Cursor = guarded("query") {
    val cursor = MatrixCursor(projection ?: DOCUMENT_COLUMNS)
    when (val id = DriveDocumentId.parse(documentId)) {
      is DriveDocumentId.Drive -> directory(cursor, id.wire, rootTitle(id.rootId), rootFlags(id.rootId))
      is DriveDocumentId.Item -> itemRow(cursor, id.itemId)
      DriveDocumentId.SharedWithMe -> directory(cursor, id.wire, "Shared with me", 0)
      DriveDocumentId.Offline -> directory(cursor, id.wire, "Offline", 0)
    }
    cursor
  }

  override fun queryChildDocuments(parentDocumentId: String, projection: Array<String>?, sortOrder: String?): Cursor {
    val parent = DriveDocumentId.parse(parentDocumentId)
    val cursor = MatrixCursor(projection ?: DOCUMENT_COLUMNS)
    cursor.setNotificationUri(ctx.contentResolver, DriveAuthority.childrenUri(ctx, parentDocumentId))
    if (parent is DriveDocumentId.Offline) {
      store.topLevel().forEach { offlineRow(cursor, it) }
      return cursor
    }
    val (children, stale) = browser.children(parent)
    if (offlineFallback(parent, children, cursor)) return cursor
    children.forEach { row(cursor, it, true) }
    if (stale) {
      cursor.extras = Bundle().apply { putBoolean(DocumentsContract.EXTRA_LOADING, true) }
      refreshLater(parent)
    }
    return cursor
  }

  override fun querySearchDocuments(rootId: String, query: String, projection: Array<String>?): Cursor {
    val cursor = MatrixCursor(projection ?: DOCUMENT_COLUMNS)
    val root = DriveDocumentId.parse(rootId) as? DriveDocumentId.Drive ?: return cursor
    guarded("search") { browser.search(query, root.rootId) }.forEach { row(cursor, it, true) }
    return cursor
  }

  override fun queryRecentDocuments(rootId: String, projection: Array<String>?): Cursor {
    val cursor = MatrixCursor(projection ?: DOCUMENT_COLUMNS)
    if (DriveDocumentId.parse(rootId) !is DriveDocumentId.Drive) return cursor
    guarded("recents") { browser.recents() }.forEach { row(cursor, it, true) }
    return cursor
  }

  override fun isChildDocument(parentDocumentId: String, documentId: String): Boolean {
    val parent = DriveDocumentId.parse(parentDocumentId)
    val child = DriveDocumentId.parse(documentId) as? DriveDocumentId.Item ?: return false
    var current = cache.item(child.itemId)
    while (current != null) {
      val holder = current.parentId
      if (parent is DriveDocumentId.Drive && holder == null) return current.rootId == parent.rootId
      if (parent is DriveDocumentId.Item && holder == parent.itemId) return true
      current = holder?.let { cache.item(it) }
    }
    return false
  }

  override fun openDocument(documentId: String, mode: String, signal: CancellationSignal?): ParcelFileDescriptor {
    val id = DriveDocumentId.parse(documentId) as? DriveDocumentId.Item ?: throw FileNotFoundException("Only files open")
    return guarded("open") { opener.open(id.itemId, mode) { changed(it) } }
  }

  override fun openDocumentThumbnail(documentId: String, sizeHint: Point, signal: CancellationSignal?): AssetFileDescriptor {
    val id = DriveDocumentId.parse(documentId) as? DriveDocumentId.Item ?: throw FileNotFoundException("Only files have thumbnails")
    val file = guarded("thumbnail") { opener.thumbnail(id.itemId) }
    return AssetFileDescriptor(ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY), 0, AssetFileDescriptor.UNKNOWN_LENGTH)
  }

  override fun createDocument(parentDocumentId: String, mimeType: String, displayName: String): String = guarded("create") {
    val parent = DriveDocumentId.parse(parentDocumentId)
    val created =
      if (mimeType == Document.MIME_TYPE_DIR) browser.createFolder(parent, displayName) else opener.createFile(parent, displayName, mimeType)
    changed(parent.wire)
    DriveDocumentId.Item(created).wire
  }

  override fun renameDocument(documentId: String, displayName: String): String? = guarded("rename") {
    val id = DriveDocumentId.parse(documentId) as? DriveDocumentId.Item ?: throw FileNotFoundException("Only files and folders rename")
    val item = browser.item(id.itemId)
    val renamed = browser.rename(id.itemId, displayName)
    changed(browser.parentKey(item))
    if (renamed == id.itemId) null else DriveDocumentId.Item(renamed).wire
  }

  override fun moveDocument(sourceDocumentId: String, sourceParentDocumentId: String, targetParentDocumentId: String): String =
    guarded("move") {
      val moved = relocate(sourceDocumentId, targetParentDocumentId) { item, folder -> browser.move(item, folder) }
      changed(sourceParentDocumentId)
      changed(targetParentDocumentId)
      moved
    }

  override fun copyDocument(sourceDocumentId: String, targetParentDocumentId: String): String = guarded("copy") {
    val copied = relocate(sourceDocumentId, targetParentDocumentId) { item, folder -> browser.copy(item, folder) }
    changed(targetParentDocumentId)
    copied
  }

  override fun deleteDocument(documentId: String) = guarded("delete") {
    val id = DriveDocumentId.parse(documentId) as? DriveDocumentId.Item ?: throw FileNotFoundException("Only files and folders delete")
    val item = browser.item(id.itemId)
    browser.trash(id.itemId)
    changed(browser.parentKey(item))
  }

  private fun relocate(source: String, target: String, action: (String, String) -> String): String {
    val item = DriveDocumentId.parse(source) as? DriveDocumentId.Item ?: throw FileNotFoundException("Only files and folders move")
    val folder = DriveDocumentId.parse(target) as? DriveDocumentId.Item
      ?: throw UnsupportedOperationException("Move or copy into a folder; the top of a drive cannot take files this way")
    return DriveDocumentId.Item(action(item.itemId, folder.itemId)).wire
  }

  fun changed(key: String) {
    browser.invalidate(listOf(key))
    ctx.contentResolver.notifyChange(DriveAuthority.childrenUri(ctx, key), null)
  }

  private fun refreshLater(parent: DriveDocumentId) {
    if (!refreshing.add(parent.wire)) return
    background.execute {
      try {
        guarded("refresh") { browser.refresh(parent) }
        ctx.contentResolver.notifyChange(DriveAuthority.childrenUri(ctx, parent.wire), null)
      } catch (failure: FileNotFoundException) {
        NativeLog.warn(SCOPE, "refresh.failed", failure) { mapOf("listing" to parent.wire.take(8)) }
      } finally {
        refreshing.remove(parent.wire)
      }
    }
  }

  private fun offlineFallback(parent: DriveDocumentId, children: List<CachedItem>, cursor: MatrixCursor): Boolean {
    if (parent !is DriveDocumentId.Item || children.isNotEmpty() || browser.loaded(parent)) return false
    val kept = store.childrenOf(parent.itemId)
    if (kept.isEmpty()) return false
    kept.forEach { offlineRow(cursor, it) }
    refreshLater(parent)
    return true
  }

  private fun itemRow(cursor: MatrixCursor, itemId: String) {
    try {
      row(cursor, guarded("document") { browser.item(itemId) }, true)
    } catch (failure: FileNotFoundException) {
      val held = store.entry(itemId) ?: throw failure
      offlineRow(cursor, held)
    }
  }

  private fun rootTitle(rootId: String): String =
    browser.roots().firstOrNull { it.id == rootId }?.let { if (it.scope == "home") "Shared Drive" else "My Drive" } ?: "Drive"

  private fun rootFlags(rootId: String): Int = if (browser.rootAccess(rootId).writes) Document.FLAG_DIR_SUPPORTS_CREATE else 0

  private fun root(cursor: MatrixCursor, id: String, title: String, flags: Int) {
    cursor.newRow()
      .add(Root.COLUMN_ROOT_ID, id)
      .add(Root.COLUMN_DOCUMENT_ID, id)
      .add(Root.COLUMN_TITLE, title)
      .add(Root.COLUMN_FLAGS, flags)
      .add(Root.COLUMN_ICON, ctx.applicationInfo.icon)
  }

  private fun directory(cursor: MatrixCursor, id: String, name: String, flags: Int) {
    cursor.newRow()
      .add(Document.COLUMN_DOCUMENT_ID, id)
      .add(Document.COLUMN_DISPLAY_NAME, name)
      .add(Document.COLUMN_MIME_TYPE, Document.MIME_TYPE_DIR)
      .add(Document.COLUMN_FLAGS, flags)
  }

  private fun row(cursor: MatrixCursor, item: CachedItem, online: Boolean) {
    val flags = DriveDocumentFlags.of(item.folder, item.access, item.locked, online, item.thumb)
    cursor.newRow()
      .add(Document.COLUMN_DOCUMENT_ID, DriveDocumentId.Item(item.id).wire)
      .add(Document.COLUMN_DISPLAY_NAME, item.name)
      .add(Document.COLUMN_SIZE, if (item.folder) null else item.bytes)
      .add(Document.COLUMN_MIME_TYPE, if (item.folder) Document.MIME_TYPE_DIR else item.mime ?: DEFAULT_MIME)
      .add(Document.COLUMN_LAST_MODIFIED, item.modifiedMs)
      .add(Document.COLUMN_FLAGS, flags)
  }

  private fun offlineRow(cursor: MatrixCursor, entry: OfflineEntry) {
    cursor.newRow()
      .add(Document.COLUMN_DOCUMENT_ID, DriveDocumentId.Item(entry.itemId).wire)
      .add(Document.COLUMN_DISPLAY_NAME, entry.name)
      .add(Document.COLUMN_SIZE, if (entry.folder) null else entry.bytes)
      .add(Document.COLUMN_MIME_TYPE, if (entry.folder) Document.MIME_TYPE_DIR else entry.mime)
      .add(Document.COLUMN_FLAGS, 0)
  }

  private fun <T> guarded(what: String, block: () -> T): T = DriveGuard.run(SCOPE, what, block)

  private companion object {
    const val SCOPE = "drive-provider"
    const val DEFAULT_MIME = "application/octet-stream"
    const val DRIVE_ROOT_FLAGS =
      Root.FLAG_SUPPORTS_CREATE or Root.FLAG_SUPPORTS_SEARCH or Root.FLAG_SUPPORTS_RECENTS or Root.FLAG_SUPPORTS_IS_CHILD
    val ROOT_COLUMNS = arrayOf(Root.COLUMN_ROOT_ID, Root.COLUMN_DOCUMENT_ID, Root.COLUMN_TITLE, Root.COLUMN_FLAGS, Root.COLUMN_ICON)
    val DOCUMENT_COLUMNS = arrayOf(
      Document.COLUMN_DOCUMENT_ID,
      Document.COLUMN_DISPLAY_NAME,
      Document.COLUMN_SIZE,
      Document.COLUMN_MIME_TYPE,
      Document.COLUMN_LAST_MODIFIED,
      Document.COLUMN_FLAGS,
    )
  }
}

object DriveAuthority {
  fun of(context: Context): String = "${context.packageName}.drive.documents"

  fun rootsUri(context: Context): Uri = DocumentsContract.buildRootsUri(of(context))

  fun childrenUri(context: Context, key: String): Uri = DocumentsContract.buildChildDocumentsUri(of(context), key)
}

object DriveGuard {
  fun <T> run(scope: String, what: String, block: () -> T): T = try {
    block()
  } catch (failure: SecurityException) {
    throw failure
  } catch (failure: FileNotFoundException) {
    throw failure
  } catch (failure: UnsupportedOperationException) {
    throw failure
  } catch (failure: Exception) {
    NativeLog.warn(scope, "call.failed", failure) { mapOf("operation" to what, "type" to failure.javaClass.simpleName) }
    throw FileNotFoundException("${failure.javaClass.simpleName}: ${failure.message}").apply { initCause(failure) }
  }
}
