package expo.modules.healthconnect.diagnostics

import android.util.Log
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

enum class NativeLevel(val label: String) {
  TRACE("trace"),
  DEBUG("debug"),
  INFO("info"),
  WARN("warn"),
  ERROR("error");

  companion object {
    fun parse(label: String): NativeLevel? = entries.firstOrNull { it.label == label }
  }
}

object NativeLog {
  private const val TAG = "SmartEverything"
  private const val REPLAY = 256
  private const val BUFFER = 512
  private const val CAUSE_DEPTH = 4

  @Volatile private var threshold = NativeLevel.INFO.ordinal
  private val sequence = AtomicLong()
  private val delivered = AtomicLong()

  private val flow = MutableSharedFlow<Map<String, Any?>>(
    replay = REPLAY,
    extraBufferCapacity = BUFFER,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
  )

  val events: SharedFlow<Map<String, Any?>> = flow

  fun setLevel(level: NativeLevel) {
    threshold = level.ordinal
  }

  fun claim(entry: Map<String, Any?>): Boolean {
    val seq = entry["seq"] as? Long ?: return true
    while (true) {
      val seen = delivered.get()
      if (seq <= seen) return false
      if (delivered.compareAndSet(seen, seq)) return true
    }
  }

  fun level(): NativeLevel = NativeLevel.entries[threshold]

  fun enabled(level: NativeLevel): Boolean = level.ordinal >= threshold

  inline fun trace(scope: String, event: String, durationMs: Long? = null, payload: () -> Map<String, Any?> = { emptyMap() }) {
    if (enabled(NativeLevel.TRACE)) record(NativeLevel.TRACE, scope, event, null, durationMs, payload())
  }

  inline fun debug(scope: String, event: String, durationMs: Long? = null, payload: () -> Map<String, Any?> = { emptyMap() }) {
    if (enabled(NativeLevel.DEBUG)) record(NativeLevel.DEBUG, scope, event, null, durationMs, payload())
  }

  inline fun info(scope: String, event: String, durationMs: Long? = null, payload: () -> Map<String, Any?> = { emptyMap() }) {
    if (enabled(NativeLevel.INFO)) record(NativeLevel.INFO, scope, event, null, durationMs, payload())
  }

  inline fun warn(scope: String, event: String, cause: Throwable? = null, durationMs: Long? = null, payload: () -> Map<String, Any?> = { emptyMap() }) {
    if (enabled(NativeLevel.WARN)) record(NativeLevel.WARN, scope, event, cause, durationMs, payload())
  }

  inline fun error(scope: String, event: String, cause: Throwable? = null, durationMs: Long? = null, payload: () -> Map<String, Any?> = { emptyMap() }) {
    if (enabled(NativeLevel.ERROR)) record(NativeLevel.ERROR, scope, event, cause, durationMs, payload())
  }

  fun elapsedMs(startNanos: Long): Long = (System.nanoTime() - startNanos) / 1_000_000

  @PublishedApi
  internal fun record(level: NativeLevel, scope: String, event: String, cause: Throwable?, durationMs: Long?, payload: Map<String, Any?>) {
    try {
      val entry = HashMap<String, Any?>(payload.size + 8)
      for ((key, value) in payload) entry[key] = plain(value)
      entry["level"] = level.label
      entry["scope"] = scope
      entry["event"] = event
      entry["seq"] = sequence.incrementAndGet()
      entry["at"] = System.currentTimeMillis()
      entry["thread"] = Thread.currentThread().name
      if (durationMs != null) entry["durationMs"] = durationMs
      if (cause != null) describe(cause, entry)
      flow.tryEmit(entry)
      if (level.ordinal >= NativeLevel.WARN.ordinal) mirror(level, scope, event, entry)
    } catch (ignored: Exception) {
    }
  }

  private fun mirror(level: NativeLevel, scope: String, event: String, entry: Map<String, Any?>) {
    val line = "$scope $event ${entry["errorName"] ?: ""} ${entry["errorMessage"] ?: ""}".trim()
    if (level == NativeLevel.ERROR) Log.e(TAG, line) else Log.w(TAG, line)
  }

  private fun describe(cause: Throwable, entry: MutableMap<String, Any?>) {
    entry["errorName"] = cause.javaClass.simpleName
    entry["errorMessage"] = DiagnosticText.description(cause.message)
    val chain = ArrayList<String>(CAUSE_DEPTH)
    var next = cause.cause
    while (next != null && chain.size < CAUSE_DEPTH && next !== cause) {
      chain.add("${next.javaClass.simpleName}: ${DiagnosticText.description(next.message).orEmpty()}")
      next = next.cause
    }
    if (chain.isNotEmpty()) entry["causes"] = chain
    entry["errorClass"] = cause.javaClass.name
  }

  private fun plain(value: Any?): Any? = when (value) {
    null, is String, is Boolean, is Int, is Long, is Double -> value
    is Float -> value.toDouble()
    is Number -> value.toDouble()
    is Map<*, *> -> value.entries.associate { it.key.toString() to plain(it.value) }
    is Iterable<*> -> value.map { plain(it) }
    else -> value.toString()
  }

  private val SEGMENT_ID = Regex("[0-9a-fA-F-]{8,}|[0-9]+|.*[0-9].{6,}")

  fun template(path: String): String {
    val bare = path.substringBefore('?')
    return bare.split('/').joinToString("/") { if (it.isNotEmpty() && SEGMENT_ID.matches(it)) ":id" else it }
  }

  fun hostOnly(url: String): String = try {
    java.net.URI(url).let { "${it.scheme}://${it.host}:${if (it.port == -1) "" else it.port}" }
  } catch (ignored: Exception) {
    "invalid"
  }

  fun reasonText(reason: String): String = DiagnosticText.description(reason).orEmpty()

  fun shortId(value: String?): String? = value?.take(8)

  fun scopeLabel(scopeId: String): String {
    val parts = scopeId.split(':')
    return if (parts.size == 3 && parts[0] == "native") "native:${parts[1]}:${parts[2].take(8)}" else scopeId.take(24)
  }
}

class NativeTally(private val scope: String, private val event: String, private val intervalMs: Long = 5_000L) {
  private val count = AtomicLong()
  private val failures = AtomicLong()
  private val totalMs = AtomicLong()
  private val maxMs = AtomicLong()
  private val windowStart = AtomicLong(System.currentTimeMillis())

  fun add(durationMs: Long, ok: Boolean = true) {
    count.incrementAndGet()
    if (!ok) failures.incrementAndGet()
    totalMs.addAndGet(durationMs)
    var seen = maxMs.get()
    while (durationMs > seen && !maxMs.compareAndSet(seen, durationMs)) seen = maxMs.get()
    val now = System.currentTimeMillis()
    val started = windowStart.get()
    if (now - started < intervalMs || !windowStart.compareAndSet(started, now)) return
    val events = count.getAndSet(0)
    val failed = failures.getAndSet(0)
    val total = totalMs.getAndSet(0)
    val max = maxMs.getAndSet(0)
    if (events == 0L) return
    NativeLog.debug(scope, event) {
      mapOf("count" to events, "failures" to failed, "avgMs" to total / events, "maxMs" to max, "windowMs" to now - started)
    }
  }
}
