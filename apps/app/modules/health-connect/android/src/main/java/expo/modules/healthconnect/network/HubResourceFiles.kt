package expo.modules.healthconnect.network

import android.content.Context
import java.io.File
import java.io.IOException
import java.io.OutputStream
import okhttp3.Response

class HubResourceFile(val file: File, val mime: String, val name: String) {
  @Volatile var shared = false
  @Volatile var withdrawPermission: (() -> Unit)? = null
  @Volatile var withdrawalKey: String? = null
  val expiresAt = System.currentTimeMillis() + MAX_PRESENTATION_MILLIS
  companion object { private const val MAX_PRESENTATION_MILLIS = 10 * 60 * 1000L }
}

object HubResourceFiles {
  private const val CHUNK_BYTES = 32768
  fun fetch(context: Context, grant: HubResourceGrant, grants: HubResourceGrants): HubResourceFile {
    grant.check()
    grant.downloaded?.let {
      if (it.expiresAt > System.currentTimeMillis() && it.file.exists()) return it
      grants.retireFile(grant, it)
    }
    val directory = directory(context, grant)
    val file = File.createTempFile("resource-", ".part", directory)
    try { grant.track(file) } catch (failure: Exception) { delete(file); throw failure }
    val call = try { HubResourceStream.request(grant) } catch (failure: Exception) { delete(file); throw failure }
    var completedFile: File? = null
    try {
      return HubResourceStream.response(grant, call, grants).use { response ->
        require(response.isSuccessful) { "Hub refused the signed resource download (${response.code})" }
        val mime = mime(response)
        val name = filename(response, grant)
        file.outputStream().use { copy(grants, grant, call, response, it, file) }
        grant.check()
        val completed = File(directory, "${file.name.removeSuffix(".part")}-$name")
        completedFile = completed
        grant.track(completed)
        require(!completed.exists() && file.renameTo(completed)) { "Private resource completion failed" }
        grant.check()
        HubResourceFile(completed, mime, name).also { grant.downloaded = it; grants.completed(grant, it) }
      }
    } catch (failure: Exception) {
      if (!file.delete() && file.exists()) throw IOException("Private resource cleanup failed", failure)
      completedFile?.let { delete(it) }
      throw failure
    } finally { grant.untrack(call); call.cancel() }
  }
  fun clean(context: Context) {
    val root = File(context.cacheDir.canonicalFile, "hub-resources")
    require(root.canonicalFile == root.absoluteFile) { "Resource directory cannot be a symbolic link" }
    if (!root.exists()) return
    require(root.listFiles() != null) { "Private resource directory cannot be inspected" }
    root.listFiles()?.forEach { entry ->
      require(Regex("[0-9a-f]{64}").matches(entry.name) && entry.canonicalFile == entry.absoluteFile)
      entry.listFiles()?.forEach { file -> require(file.canonicalFile == file.absoluteFile && file.isFile); delete(file) }
      delete(entry)
    }
  }
  private fun directory(context: Context, grant: HubResourceGrant): File {
    val root = File(context.cacheDir.canonicalFile, "hub-resources")
    require(root.canonicalFile == root.absoluteFile) { "Resource directory cannot be a symbolic link" }
    require(root.isDirectory || root.mkdir()) { "Could not create private resource directory" }
    val directory = File(root, grant.id)
    require(directory.canonicalFile == directory.absoluteFile)
    require(directory.isDirectory || directory.mkdir())
    return directory
  }
  private fun copy(grants: HubResourceGrants, grant: HubResourceGrant, call: okhttp3.Call, response: Response, output: OutputStream, file: File) {
    val input = response.body?.byteStream() ?: throw IOException("Signed resource has no response body")
    val buffer = ByteArray(CHUNK_BYTES)
    val expected = response.body?.contentLength() ?: -1
    if (expected >= 0 && expected > file.usableSpace) throw IOException("Insufficient private storage for resource")
    while (true) {
      grant.check(call)
      val count = try { input.read(buffer) } catch (failure: IOException) { grants.failed(grant, call); throw failure }
      if (count < 0) break
      grant.check(call)
      if (file.usableSpace < count) throw IOException("Private resource storage is full")
      output.write(buffer, 0, count)
    }
    output.flush()
  }
  private fun mime(response: Response): String {
    val value = response.header("Content-Type")?.substringBefore(';') ?: "application/octet-stream"
    require(Regex("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+").matches(value)) { "Invalid resource MIME type" }
    return value
  }
  private fun filename(response: Response, grant: HubResourceGrant): String {
    val supplied = response.header("Content-Disposition")?.let { Regex("(?:^|;)\\s*filename=\"?([^\";]+)", RegexOption.IGNORE_CASE).find(it)?.groupValues?.get(1) }
    val path = java.net.URI(grant.url).path.substringAfterLast('/')
    val value = supplied ?: path.ifEmpty { "resource" }
    val safe = value.replace(Regex("[^A-Za-z0-9._ -]"), "_").trim(' ', '.').take(120)
    return if (safe.isEmpty()) "resource" else safe
  }
  fun delete(file: File) {
    if (!file.delete() && file.exists()) throw IOException("Could not remove private resource file")
  }
}
