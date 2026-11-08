package expo.modules.healthconnect.diagnostics

import android.app.ApplicationExitInfo
import android.os.Build
import expo.modules.healthconnect.watch.parseProto
import expo.modules.healthconnect.watch.ProtoMessage
import java.io.ByteArrayOutputStream
import java.io.InputStream

object DiagnosticText {
  private const val LIMIT = 240
  private val CREDENTIAL_ASSIGNMENT = Regex("\\b[A-Za-z0-9_.-]*(?:password|passwd|pwd|token|secret|credential|key|authorization|ssecurity|(?:one[_. -]?time|verification)[_. -]?code)[A-Za-z0-9_.-]*\\b[\\\"']?\\s*[:=]\\s*(?:\\\"[^\\\"]*(?:\\\"|$)|'[^']*(?:'|$)|[^\\s,;)}\\]]+)", RegexOption.IGNORE_CASE)
  private val AUTHORIZATION_VALUE = Regex("\\b(?:bearer|basic)\\s+(?:\\\"[^\\\"]*(?:\\\"|$)|'[^']*(?:'|$)|[^\\s,;)}\\]]+)", RegexOption.IGNORE_CASE)
  private val PRIVATE_TEXT = Regex("https?://\\S+|[\\w.+-]+@[\\w.-]+|\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b|[A-Za-z0-9_-]{24,}|(?:/[^\\s,;)]+)+|[\\\"'][^\\\"']*[\\\"']")

  fun description(value: String?): String? = value?.replace(AUTHORIZATION_VALUE, "[redacted]")
    ?.replace(CREDENTIAL_ASSIGNMENT, "[redacted]")?.replace(PRIVATE_TEXT, "[redacted]")
    ?.replace(Regex("[\\p{Cntrl}]"), " ")?.take(LIMIT)

  fun symbol(value: String?): String? {
    if (value == null || !value.matches(Regex("[A-Za-z0-9_:$<>(), .*&\\[\\]~+=-]{1,240}"))) return null
    return description(value)
  }

  fun module(value: String?): String? {
    val name = value?.substringAfterLast('/')?.removeSuffix(" (deleted)") ?: return null
    if (!name.matches(Regex("(?:lib[A-Za-z0-9_.-]{1,100}\\.so|node|base\\.apk)"))) return null
    return description(name)
  }
}

object NativeTrace {
  private const val MAX_BYTES = 512 * 1024
  private const val MAX_FRAMES = 24
  private val JAVA_THROWABLE = Regex("(?:[\\w$]+\\.)+[A-Z][\\w$]*(?:Exception|Error|Throwable|Failure)")
  private val JAVA_FRAME = Regex("(?:^|\\sat\\s)[\\w$.]+\\.[\\w$<>]+\\(")

  fun read(exit: ApplicationExitInfo): Map<String, Any?> = when (exit.reason) {
    ApplicationExitInfo.REASON_CRASH_NATIVE -> readNative(exit.traceInputStream)
    ApplicationExitInfo.REASON_CRASH -> readJava(exit.traceInputStream)
    else -> state("not_native")
  }

  private fun readNative(stream: InputStream?): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return state("unsupported")
    return try {
      decode(stream?.use { bounded(it) } ?: return state("unavailable"))
    } catch (failure: Exception) {
      state("unreadable")
    }
  }

  private fun readJava(stream: InputStream?): Map<String, Any?> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || stream == null) return state("unavailable")
    return try {
      val text = stream.use { bounded(it) }?.decodeToString() ?: return state("too_large")
      val name = JAVA_THROWABLE.find(text)?.value ?: return state("unreadable")
      val frame = JAVA_FRAME.find(text)?.value ?: return state("unreadable")
      mapOf(
        "state" to "java",
        "name" to name.substringAfterLast('.'),
        "message" to DiagnosticText.description(text.lineSequence().first()),
        "frame" to DiagnosticText.symbol(frame.substring(0, frame.length - 1))
      )
    } catch (failure: Exception) {
      state("unreadable")
    }
  }

  private fun bounded(stream: InputStream): ByteArray? {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (true) {
      val count = stream.read(buffer)
      if (count == -1) return output.toByteArray()
      if (output.size() + count > MAX_BYTES) return null
      output.write(buffer, 0, count)
    }
  }

  private fun decode(bytes: ByteArray): Map<String, Any?> {
    val tombstone = parseProto(bytes)
    val tid = tombstone.int(6) ?: return state("unreadable")
    val thread = tombstone.all(16).asSequence().map { parseProto(it) }
      .firstOrNull { it.int(1) == tid }?.message(2) ?: return state("unreadable")
    val signal = tombstone.message(10) ?: return state("unreadable")
    val frames = thread.all(4).take(MAX_FRAMES).map { frame(parseProto(it)) }
    return mapOf(
      "state" to "captured",
      "signal" to (signal.int(1) ?: 0),
      "signalCode" to (signal.int(3) ?: 0),
      "frames" to frames
    )
  }

  private fun frame(value: ProtoMessage): Map<String, Any?> = mapOf(
    "module" to DiagnosticText.module(value.string(6)),
    "function" to DiagnosticText.symbol(value.string(4)),
    "relativePc" to java.lang.Long.toUnsignedString(value.varint(1) ?: 0, 16)
  )

  private fun state(value: String): Map<String, Any?> = mapOf("state" to value)
}
