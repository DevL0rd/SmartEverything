package expo.modules.healthconnect.photos

import android.content.ContentResolver
import android.content.ContentUris
import android.net.Uri
import android.os.Build
import android.os.CancellationSignal
import android.provider.MediaStore
import java.io.Closeable
import java.io.File
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

internal class PhotoOperation : Closeable {
  val cancelled = AtomicBoolean(false)
  val query = CancellationSignal()
  @Volatile var stream: InputStream? = null

  fun check() {
    check(!cancelled.get()) { "Media operation cancelled" }
  }

  override fun close() {
    cancelled.set(true)
    query.cancel()
    stream?.close()
  }
}

internal class PhotosMedia(
  private val resolver: ContentResolver,
  private val cache: File,
  private val originalLocation: () -> Boolean
) {
  private val operations = ConcurrentHashMap<String, PhotoOperation>()
  private val chunks = ConcurrentHashMap.newKeySet<File>()

  fun prepare(id: String) {
    check(operations.putIfAbsent(id, PhotoOperation()) == null)
  }

  fun cancel(id: String) {
    operations[id]?.close()
  }

  fun releaseChunk(value: String) {
    val chunk = File(requireNotNull(Uri.parse(value).path))
    require(chunk.parentFile?.canonicalFile == cache.canonicalFile && chunk.name.startsWith("photos-upload-"))
    check(!chunk.exists() || chunk.delete()) { "Could not remove upload chunk" }
    chunks.remove(chunk)
  }

  fun close() {
    operations.values.forEach { it.close() }
    operations.clear()
    chunks.toList().forEach { releaseChunk(Uri.fromFile(it).toString()) }
  }

  private fun uri(value: String): Uri =
    if (value.startsWith("content://")) Uri.parse(value)
    else ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), value.toLong())

  private fun original(value: String): Uri {
    val uri = uri(value)
    return if (Build.VERSION.SDK_INT >= 29 && uri.authority == MediaStore.AUTHORITY && originalLocation()) MediaStore.setRequireOriginal(uri) else uri
  }

  fun stat(ids: List<String>, operationId: String): List<Map<String, Any>> {
    val operation = requireNotNull(operations[operationId])
    try {
      return ids.mapNotNull { id ->
        operation.check()
        resolver.query(uri(id), null, null, null, null, operation.query)?.use { cursor ->
          if (!cursor.moveToFirst()) return@use null
          fun number(column: String): Long = cursor.getLong(cursor.getColumnIndexOrThrow(column))
          fun text(column: String): String = cursor.getString(cursor.getColumnIndexOrThrow(column)) ?: ""
          mapOf(
            "id" to id,
            "bytes" to number(MediaStore.MediaColumns.SIZE),
            "mimeType" to text(MediaStore.MediaColumns.MIME_TYPE),
            "relativePath" to if (Build.VERSION.SDK_INT >= 29) text(MediaStore.MediaColumns.RELATIVE_PATH) else "",
            "dateAddedSeconds" to number(MediaStore.MediaColumns.DATE_ADDED),
            "modifiedSeconds" to number(MediaStore.MediaColumns.DATE_MODIFIED),
            "isPending" to (Build.VERSION.SDK_INT >= 29 && number(MediaStore.MediaColumns.IS_PENDING) != 0L),
            "isTrashed" to (Build.VERSION.SDK_INT >= 30 && number(MediaStore.MediaColumns.IS_TRASHED) != 0L)
          )
        }
      }
    } finally {
      operations.remove(operationId)
    }
  }

  fun hash(value: String, id: String): Map<String, Any> = read(value, id) { stream, operation ->
    PhotoStreams.hash(stream, operation::check)
  }

  fun range(value: String, id: String, offset: Long, length: Int): String {
    return read(value, id) { stream, operation ->
      val buffer = PhotoStreams.range(stream, offset, length, operation::check)
      val chunk = File.createTempFile("photos-upload-", ".chunk", cache)
      chunks.add(chunk)
      try {
        chunk.writeBytes(buffer)
        operation.check()
        Uri.fromFile(chunk).toString()
      } catch (error: Exception) {
        chunk.delete()
        chunks.remove(chunk)
        throw error
      }
    }
  }

  private fun <T> read(value: String, id: String, block: (InputStream, PhotoOperation) -> T): T {
    val operation = requireNotNull(operations[id])
    try {
      operation.check()
      return requireNotNull(resolver.openInputStream(original(value))).use { stream ->
        operation.stream = stream
        operation.check()
        block(stream, operation)
      }
    } finally {
      operation.stream = null
      operations.remove(id)
    }
  }
}
