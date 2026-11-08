package expo.modules.healthconnect.network

import android.content.Context
import android.content.pm.PackageInstaller
import java.io.InputStream
import java.io.OutputStream
import java.security.MessageDigest
import java.util.UUID
import org.json.JSONObject

internal data class AndroidUpdateRequest(
  val id: String,
  val releaseId: String,
  val applicationId: String,
  val versionCode: Long,
  val size: Long,
  val sha256: String,
) {
  companion object {
    private val DIGEST = Regex("[0-9a-f]{64}")
    private val REQUEST_KEYS = setOf("id", "releaseId", "build", "size", "sha256")
    private val BUILD_KEYS = setOf("applicationId", "versionCode")

    fun parse(json: String): AndroidUpdateRequest {
      val input = JSONObject(json)
      expectKeys("request", input, REQUEST_KEYS)
      val build = input.getJSONObject("build")
      expectKeys("build", build, BUILD_KEYS)
      return AndroidUpdateRequest(
        input.getString("id"),
        input.getString("releaseId"),
        build.getString("applicationId"),
        build.getString("versionCode").toLong(),
        input.getLong("size"),
        input.getString("sha256"),
      ).also {
        require(DIGEST.matches(it.id) && DIGEST.matches(it.sha256)) { "Invalid Android update digest" }
        require(UUID.fromString(it.releaseId).toString() == it.releaseId) { "Invalid Android release ID" }
        require(it.applicationId.isNotBlank() && it.versionCode > 0 && it.size > 0) { "Invalid Android update build" }
      }
    }

    private fun expectKeys(label: String, input: JSONObject, expected: Set<String>) {
      val keys = input.keys().asSequence().toSet()
      val missing = expected - keys
      val extra = keys - expected
      require(missing.isEmpty() && extra.isEmpty()) {
        "Android update $label keys differ from the contract (missing: ${missing.sorted()}, unexpected: ${extra.sorted()})"
      }
    }
  }
}

internal object AndroidUpdateInstaller {
  const val APK_MIME = "application/vnd.android.package-archive"
  private const val APK_ENTRY = "base.apk"
  private const val APK_BUFFER_BYTES = 32768

  fun admit(context: Context, update: AndroidUpdateRequest, mime: String?, length: Long) {
    require(update.applicationId == context.packageName) { "Update targets a different app" }
    require(mime == APK_MIME && (length < 0 || length == update.size)) { "Update size or type did not match its offer" }
  }

  fun stream(
    session: PackageInstaller.Session,
    source: InputStream,
    update: AndroidUpdateRequest,
    progress: AndroidUpdateProgress,
    checkGrant: () -> Unit,
  ) {
    checkGrant()
    val digest = MessageDigest.getInstance("SHA-256")
    session.openWrite(APK_ENTRY, 0, update.size).use { destination ->
      val received = copy(source, destination, digest, update, progress, checkGrant)
      progress.report(AndroidUpdateStage.VERIFYING, received)
      require(received == update.size) { "Update size did not match its offer" }
      require(digest.digest().joinToString("") { "%02x".format(it) } == update.sha256) {
        "Update checksum did not match its offer"
      }
      checkGrant()
      session.fsync(destination)
    }
  }

  private fun copy(
    source: InputStream,
    destination: OutputStream,
    digest: MessageDigest,
    update: AndroidUpdateRequest,
    progress: AndroidUpdateProgress,
    checkGrant: () -> Unit,
  ): Long {
    val buffer = ByteArray(APK_BUFFER_BYTES)
    var received = 0L
    progress.report(AndroidUpdateStage.DOWNLOADING, received)
    while (true) {
      checkGrant()
      val count = source.read(buffer)
      if (count < 0) return received
      received += count
      require(received <= update.size) { "Update size did not match its offer" }
      digest.update(buffer, 0, count)
      destination.write(buffer, 0, count)
      progress.report(AndroidUpdateStage.DOWNLOADING, received)
    }
  }
}
