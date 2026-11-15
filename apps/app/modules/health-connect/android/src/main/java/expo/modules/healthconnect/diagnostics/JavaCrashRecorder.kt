package expo.modules.healthconnect.diagnostics

import android.content.Context
import java.io.File

class JavaCrashRecorder(private val file: File) {
  fun record(thread: Thread, failure: Throwable, at: Long) {
    val lines = ArrayList<String>()
    lines.add("at=$at")
    lines.add("thread=${thread.name}")
    lines.add("name=${failure.javaClass.name}")
    lines.add("message=${DiagnosticText.description(failure.message).orEmpty()}")
    for (frame in framesOf(failure)) lines.add("frame=$frame")
    file.parentFile?.mkdirs()
    val staged = File(file.path + ".partial")
    staged.writeText(lines.joinToString("\n"))
    if (!staged.renameTo(file)) {
      file.writeText(lines.joinToString("\n"))
      staged.delete()
    }
  }

  fun matching(exitAt: Long): Map<String, Any?>? {
    if (!file.isFile) return null
    return try {
      val values = HashMap<String, String>()
      val frames = ArrayList<String>()
      for (line in file.readLines()) {
        val key = line.substringBefore('=', "")
        val value = line.substringAfter('=', "")
        if (key == "frame") frames.add(value) else if (key.isNotEmpty()) values[key] = value
      }
      val at = values["at"]?.toLongOrNull() ?: return null
      if (Math.abs(exitAt - at) > MATCH_WINDOW_MS) return null
      val name = values["name"]?.takeIf { it.isNotEmpty() } ?: return null
      mapOf(
        "state" to "java",
        "name" to name.substringAfterLast('.'),
        "message" to values["message"]?.takeIf { it.isNotEmpty() },
        "frame" to frames.firstOrNull(),
        "frames" to frames.take(MAX_FRAMES)
      )
    } catch (failure: Exception) {
      null
    }
  }

  private fun framesOf(failure: Throwable): List<String> {
    val frames = ArrayList<String>()
    var next: Throwable? = failure
    var depth = 0
    while (next != null && depth < CAUSE_DEPTH && frames.size < MAX_FRAMES) {
      if (depth > 0) frames.add("Caused by ${next.javaClass.name}")
      for (element in next.stackTrace) {
        if (frames.size >= MAX_FRAMES) break
        val file = element.fileName ?: "Unknown"
        val line = if (element.lineNumber >= 0) ":${element.lineNumber}" else ""
        frames.add("${element.className}.${element.methodName}($file$line)")
      }
      next = next.cause?.takeIf { it !== next }
      depth += 1
    }
    return frames.filter { FRAME.matches(it) }.map { it.take(FRAME_LIMIT) }
  }

  private class Handler(
    private val recorder: JavaCrashRecorder,
    private val previous: Thread.UncaughtExceptionHandler?
  ) : Thread.UncaughtExceptionHandler {
    override fun uncaughtException(thread: Thread, failure: Throwable) {
      try {
        recorder.record(thread, failure, System.currentTimeMillis())
      } catch (ignored: Exception) {
      }
      previous?.uncaughtException(thread, failure)
    }
  }

  companion object {
    private const val MAX_FRAMES = 24
    private const val CAUSE_DEPTH = 4
    private const val MATCH_WINDOW_MS = 30_000L
    private const val FRAME_LIMIT = 240
    private val FRAME = Regex("[A-Za-z0-9_:$<>(), .\\[\\]~+=-]{1,400}")

    fun at(context: Context) = JavaCrashRecorder(File(File(context.filesDir, "diagnostics"), "last-java-crash.txt"))

    fun install(recorder: JavaCrashRecorder) {
      val current = Thread.getDefaultUncaughtExceptionHandler()
      if (current is Handler) return
      Thread.setDefaultUncaughtExceptionHandler(Handler(recorder, current))
    }
  }
}
