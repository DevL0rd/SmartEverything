package expo.modules.healthconnect.network

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import expo.modules.healthconnect.photos.PhotoStreams
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import org.json.JSONObject

internal class RestoreRequest(
  val id: String,
  val name: String,
  val mime: String,
  val sha256: String?,
  val takenAt: Long?,
  val folder: String?,
) {
  val video: Boolean get() = mime.startsWith("video/")

  fun relativePath(): String {
    val folder = folder ?: return RESTORED_PATH
    val path = folder.trim('/')
    val top = path.substringBefore('/')
    require(path.isNotEmpty() && path.split('/').none { it.isEmpty() || it == "." || it == ".." }) {
      "The original album is not a plain folder path"
    }
    require(top in (if (video) VIDEO_TOPS else IMAGE_TOPS)) { "Android keeps this kind of media out of $top" }
    return "$path/"
  }

  companion object {
    const val RESTORED_PATH = "Pictures/Restored/"
    val IMAGE_TOPS = setOf("DCIM", "Pictures")
    val VIDEO_TOPS = setOf("DCIM", "Pictures", "Movies")
    private val KEYS = setOf("id", "name", "mimeType", "sha256", "takenAt", "target")

    fun parse(json: String): RestoreRequest {
      val input = JSONObject(json)
      require(input.keys().asSequence().toSet() == KEYS) { "Restore request has unexpected fields" }
      val name = input.getString("name")
      require(name.isNotBlank() && !name.contains('/') && !name.startsWith(".")) { "$name is not a plain file name" }
      val mime = input.getString("mimeType")
      require(mime.startsWith("image/") || mime.startsWith("video/")) { "Only photos and videos go to the gallery" }
      val sha256 = if (input.isNull("sha256")) null else input.getString("sha256").also {
        require(Regex("[0-9a-f]{64}").matches(it))
      }
      val takenAt = if (input.isNull("takenAt")) null else input.getLong("takenAt").also { require(it >= 0) }
      return RestoreRequest(input.getString("id"), name, mime, sha256, takenAt, folderOf(input.getJSONObject("target")))
    }

    private fun folderOf(target: JSONObject): String? = when (target.getString("kind")) {
      "restored" -> { require(target.length() == 1); null }
      "origin" -> { require(target.length() == 2); target.getString("folder") }
      else -> throw IllegalArgumentException("Unknown restore target")
    }
  }
}

internal class HubResourceRestore(
  private val resolver: ContentResolver,
  private val originalLocation: () -> Boolean,
) {
  fun place(source: File, request: RestoreRequest, active: () -> Unit): Map<String, Any> {
    check(Build.VERSION.SDK_INT >= 29) { "Saving to the gallery needs Android 10 or newer" }
    val digest = source.inputStream().use { hashOf(it, active) }
    request.sha256?.let { require(it == digest) { "${request.name} arrived changed; nothing was saved" } }
    val path = request.relativePath()
    val collection = collectionOf(request)
    present(collection, path, source.length(), digest, active)?.let {
      return mapOf("result" to "present", "location" to it.toString())
    }
    val uri = resolver.insert(collection, valuesOf(request, path)) ?: throw IOException("Android refused the new gallery item")
    try {
      val output = resolver.openOutputStream(uri, "w") ?: throw IOException("The new gallery item cannot be written")
      output.use { destination -> source.inputStream().use { copy(it, destination, active) } }
      resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
    } catch (failure: Exception) {
      resolver.delete(uri, null, null)
      throw failure
    }
    return mapOf("result" to "saved", "location" to uri.toString())
  }

  private fun collectionOf(request: RestoreRequest): Uri =
    if (request.video) MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    else MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)

  private fun valuesOf(request: RestoreRequest, path: String) = ContentValues().apply {
    put(MediaStore.MediaColumns.DISPLAY_NAME, request.name)
    put(MediaStore.MediaColumns.MIME_TYPE, request.mime)
    put(MediaStore.MediaColumns.RELATIVE_PATH, path)
    put(MediaStore.MediaColumns.IS_PENDING, 1)
    request.takenAt?.let { put(MediaStore.MediaColumns.DATE_TAKEN, it) }
  }

  private fun present(collection: Uri, path: String, bytes: Long, digest: String, active: () -> Unit): Uri? {
    val selection = "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND ${MediaStore.MediaColumns.SIZE} = ? AND " +
      "${MediaStore.MediaColumns.IS_PENDING} = 0"
    val query = resolver.query(collection, arrayOf(MediaStore.MediaColumns._ID), selection, arrayOf(path, bytes.toString()), null)
    query?.use { cursor ->
      while (cursor.moveToNext()) {
        active()
        val uri = ContentUris.withAppendedId(collection, cursor.getLong(0))
        val hash = resolver.openInputStream(original(uri))?.use { hashOf(it, active) }
        if (hash == digest) return uri
      }
    }
    return null
  }

  private fun original(uri: Uri): Uri = if (originalLocation()) MediaStore.setRequireOriginal(uri) else uri

  private fun hashOf(stream: InputStream, active: () -> Unit): String =
    PhotoStreams.hash(stream, active).getValue("sha256").toString()

  private fun copy(source: InputStream, destination: OutputStream, active: () -> Unit) {
    val buffer = ByteArray(COPY_BYTES)
    while (true) {
      active()
      val count = source.read(buffer)
      if (count < 0) break
      destination.write(buffer, 0, count)
    }
    destination.flush()
  }

  private companion object {
    const val COPY_BYTES = 64 * 1024
  }
}
