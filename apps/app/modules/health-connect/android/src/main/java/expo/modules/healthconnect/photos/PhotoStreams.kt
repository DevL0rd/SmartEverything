package expo.modules.healthconnect.photos

import java.io.InputStream
import java.security.MessageDigest

internal object PhotoStreams {
  fun hash(stream: InputStream, active: () -> Unit): Map<String, Any> {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(64 * 1024)
    var bytes = 0L
    while (true) {
      active()
      val count = stream.read(buffer)
      if (count < 0) break
      digest.update(buffer, 0, count)
      bytes += count
    }
    active()
    return mapOf("sha256" to digest.digest().joinToString("") { "%02x".format(it) }, "bytes" to bytes)
  }

  fun range(stream: InputStream, offset: Long, length: Int, active: () -> Unit): ByteArray {
    require(offset >= 0 && length in 0..4 * 1024 * 1024)
    var remaining = offset
    while (remaining > 0) {
      active()
      val skipped = stream.skip(remaining)
      if (skipped > 0) remaining -= skipped
      else {
        check(stream.read() >= 0) { "Media ended before requested offset" }
        remaining--
      }
    }
    val buffer = ByteArray(length)
    var position = 0
    while (position < length) {
      active()
      val count = stream.read(buffer, position, length - position)
      check(count > 0) { "Media changed during upload" }
      position += count
    }
    active()
    return buffer
  }
}
