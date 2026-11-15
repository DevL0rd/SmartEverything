package expo.modules.healthconnect.drive

import expo.modules.healthconnect.IngestRejected
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.URLDecoder
import java.util.Base64

sealed class DriveTusTarget {
  abstract fun fields(): Map<String, String>

  class Top(private val rootId: String) : DriveTusTarget() {
    override fun fields(): Map<String, String> = mapOf("targetKind" to "drive", "rootId" to rootId)
  }

  class Folder(private val folderId: String) : DriveTusTarget() {
    override fun fields(): Map<String, String> = mapOf("targetKind" to "folder", "folderId" to folderId)
  }

  class Replace(private val itemId: String, private val baseRev: Int) : DriveTusTarget() {
    override fun fields(): Map<String, String> =
      mapOf("targetKind" to "item", "itemId" to itemId, "baseRev" to baseRev.toString())
  }
}

class DriveTusResult(val itemId: String, val name: String)

object DriveTusPlan {
  const val CHUNK_BYTES = 4 * 1024 * 1024
  const val RESUMES = 3

  fun next(offset: Long, length: Long, chunk: Int = CHUNK_BYTES): Int = minOf(chunk.toLong(), length - offset).toInt()

  fun chunkCount(length: Long, chunk: Int = CHUNK_BYTES): Long = (length + chunk - 1) / chunk

  fun metadata(fields: Map<String, String>): String = fields.entries.joinToString(",") { (key, value) ->
    "$key ${Base64.getEncoder().encodeToString(value.toByteArray(Charsets.UTF_8))}"
  }
}

class DriveTusUpload(private val raw: DriveRaw) {
  fun upload(target: DriveTusTarget, name: String, mime: String?, file: File, active: () -> Unit): DriveTusResult {
    val length = file.length()
    val fields = buildMap {
      put("filename", name)
      if (mime != null) put("filetype", mime)
      putAll(target.fields())
    }
    val created = raw.answer("POST", "${DriveRaw.UPLOAD_PREFIX}/", create(length, fields), null)
    if (created.status != HTTP_CREATED) throw IngestRejected(created.status, created.body.decodeToString())
    if (length == 0L) return result(created, name)
    val location = created.headers["location"] ?: throw IngestRejected(created.status, "the hub gave no upload location")
    val path = java.net.URI(location).rawPath
    val finished = send(path, file, length, active)
    return result(finished, name)
  }

  private fun send(path: String, file: File, length: Long, active: () -> Unit): DriveRawAnswer {
    var offset = 0L
    var failures = 0
    var last: DriveRawAnswer? = null
    RandomAccessFile(file, "r").use { source ->
      while (offset < length) {
        active()
        try {
          val chunk = ByteArray(DriveTusPlan.next(offset, length))
          source.seek(offset)
          source.readFully(chunk)
          val answer = raw.answer("PATCH", path, patchHeaders(offset), chunk)
          if (answer.status != HTTP_NO_CONTENT) throw IngestRejected(answer.status, answer.body.decodeToString())
          offset = answer.headers["upload-offset"]?.toLong() ?: throw IngestRejected(answer.status, "the hub did not say how much it holds")
          last = answer
          failures = 0
        } catch (failure: IOException) {
          failures++
          if (failures > DriveTusPlan.RESUMES) throw failure
          offset = currentOffset(path)
        }
      }
    }
    return last ?: throw IngestRejected(HTTP_NO_CONTENT, "no part of the file was sent")
  }

  private fun currentOffset(path: String): Long {
    val head = raw.answer("HEAD", path, mapOf(TUS to VERSION), null)
    if (head.status != HTTP_OK) throw IngestRejected(head.status, "the upload cannot be resumed")
    return head.headers["upload-offset"]?.toLong() ?: throw IngestRejected(head.status, "the hub did not say how much it holds")
  }

  private fun create(length: Long, fields: Map<String, String>): Map<String, String> = mapOf(
    TUS to VERSION,
    "Upload-Length" to length.toString(),
    "Upload-Metadata" to DriveTusPlan.metadata(fields),
  )

  private fun patchHeaders(offset: Long): Map<String, String> = mapOf(
    TUS to VERSION,
    "Upload-Offset" to offset.toString(),
    "Content-Type" to "application/offset+octet-stream",
  )

  private fun result(answer: DriveRawAnswer, requested: String): DriveTusResult {
    val itemId = answer.headers["upload-item-id"] ?: throw IngestRejected(answer.status, "the hub stored the file but did not name it")
    val name = answer.headers["upload-item-name"]?.let { URLDecoder.decode(it, Charsets.UTF_8.name()) } ?: requested
    return DriveTusResult(itemId, name)
  }

  private companion object {
    const val TUS = "Tus-Resumable"
    const val VERSION = "1.0.0"
    const val HTTP_OK = 200
    const val HTTP_CREATED = 201
    const val HTTP_NO_CONTENT = 204
  }
}
