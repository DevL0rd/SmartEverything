package expo.modules.healthconnect.watch.xiaomi

import android.os.Handler
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.WatchFile
import expo.modules.healthconnect.watch.WatchSink
import java.util.PriorityQueue

class XiaomiSync(
  private val sink: WatchSink,
  private val handler: Handler,
  private val skipped: MutableSet<String>,
  private val send: (ByteArray) -> Unit
) {
  private val queue = PriorityQueue<XiaomiFileId>()
  private val assembler = FileAssembler()
  private val parsed = mutableListOf<Pair<XiaomiFileId, WatchFile>>()
  private var current: XiaomiFileId? = null
  private var awaitingPast = false
  private var running = false
  private val captured = mutableSetOf<String>()
  private val timeout = Runnable { fileTimedOut() }

  val busy: Boolean get() = running
  private var startedAt = 0L

  fun start(reason: String) {
    NativeLog.info(SCOPE, "sync.requested") { mapOf("reason" to reason, "alreadyRunning" to running, "skippedKeys" to skipped.size) }
    if (running) {
      sink.note("sync_skipped", "a sync is already running ($reason)")
      return
    }
    running = true
    startedAt = System.nanoTime()
    parsed.clear()
    queue.clear()
    captured.clear()
    awaitingPast = true
    sink.syncing("Asking the watch for new data ($reason)")
    send(health(FETCH_TODAY, ProtoWriter().message(5, ProtoWriter().varint(1, 0))))
    handler.postDelayed(timeout, FILE_TIMEOUT_MS)
  }

  fun stop() {
    if (running) NativeLog.info(SCOPE, "sync.aborted") { mapOf("queued" to queue.size, "parsed" to parsed.size, "awaitingPast" to awaitingPast) }
    handler.removeCallbacks(timeout)
    running = false
    assembler.reset()
  }

  fun fileList(subtype: Int, ids: ByteArray) {
    handler.removeCallbacks(timeout)
    if (ids.size % 7 != 0) {
      sink.note("sync_list_unreadable", "the watch listed ${ids.size} bytes of file ids, not a multiple of 7")
    }
    val listed = XiaomiFileId.list(ids)
    val fresh = listed.filter { it.key !in skipped }
    NativeLog.debug(SCOPE, "files.listed") {
      mapOf("subtype" to subtype, "bytes" to ids.size, "listed" to listed.size, "fresh" to fresh.size, "kinds" to fresh.groupingBy { it.shortLabel }.eachCount())
    }
    fresh.filter { it !in queue }.forEach { queue.add(it) }
    val source = if (subtype == FETCH_TODAY) "today" else "earlier days"
    sink.note("sync_files", "${fresh.size} file(s) from $source, ${listed.size - fresh.size} skipped as unsupported earlier")
    noteSleepFiles(source, listed)
    if (subtype == FETCH_TODAY) {
      send(health(FETCH_PAST, null))
      handler.postDelayed(timeout, FILE_TIMEOUT_MS)
    } else {
      awaitingPast = false
      if (current == null) next()
    }
  }

  fun chunk(bytes: ByteArray) {
    handler.removeCallbacks(timeout)
    val id = current ?: return
    val file = try {
      assembler.add(bytes)
    } catch (failure: IllegalArgumentException) {
      NativeLog.warn(SCOPE, "chunk.unreadable", failure) { mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "bytes" to bytes.size) }
      sink.note("sync_file_unreadable", "${id.label}: ${failure.message}")
      next()
      return
    }
    if (file == null) {
      handler.postDelayed(timeout, FILE_TIMEOUT_MS)
      return
    }
    received(id, file)
    next()
  }

  private fun received(id: XiaomiFileId, file: ByteArray) {
    try {
      val parseStarted = System.nanoTime()
      val checked = FileAssembler.checked(file)
      val data = XiaomiFileParser.parse(id, checked)
      parsed.add(id to data)
      NativeLog.debug(SCOPE, "file.parsed", NativeLog.elapsedMs(parseStarted)) {
        mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "bytes" to file.size, "version" to id.version, "sleep" to id.isSleep, "parsedFiles" to parsed.size)
      }
      sink.note("sync_file_read", "${id.label}: ${data.summary()}")
      if (id.isSleep && data.sleeps.isEmpty()) {
        sink.note("sync_sleep_empty", "${id.label}: ${file.size} bytes hold no finished night; it is acknowledged and removed from the watch")
      }
    } catch (implausible: ImplausibleMinute) {
      NativeLog.warn(SCOPE, "file.implausible", implausible) { mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "bytes" to file.size) }
      sink.note("sync_file_implausible", "${implausible.message}; left on the watch")
    } catch (unsupported: UnsupportedFile) {
      NativeLog.warn(SCOPE, "file.unsupported", unsupported) { mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "bytes" to file.size) }
      capture(id, file)
      skipped.add(id.key)
      sink.note("sync_file_unsupported", "${unsupported.message}; left on the watch")
    } catch (failure: IllegalArgumentException) {
      NativeLog.warn(SCOPE, "file.unreadable", failure) { mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "bytes" to file.size, "step" to "parse_or_checksum") }
      sink.note("sync_file_unreadable", "${id.label}: ${failure.message}; left on the watch")
    } catch (failure: java.nio.BufferUnderflowException) {
      NativeLog.warn(SCOPE, "file.unreadable", failure) { mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "bytes" to file.size, "step" to "underflow") }
      sink.note("sync_file_unreadable", "${id.label}: the file ended early; left on the watch")
    }
  }

  private fun capture(id: XiaomiFileId, file: ByteArray) {
    if (!captured.add(XiaomiFileCapture.kindOf(id))) {
      return
    }
    XiaomiFileCapture.lines(id, file).forEach { sink.note("sync_file_capture", it) }
  }

  private fun noteSleepFiles(source: String, listed: List<XiaomiFileId>) {
    val sleep = listed.filter { it.isSleep }
    if (sleep.isNotEmpty()) {
      sink.note("sync_sleep_files", "${sleep.size} sleep file(s) from $source: ${sleep.joinToString("; ") { "${it.label}${if (it.key in skipped) " (skipped earlier)" else ""}" }}")
    }
  }

  private fun next() {
    current = queue.poll()
    val id = current
    if (id == null) {
      if (!awaitingPast) finish()
      return
    }
    assembler.reset()
    NativeLog.debug(SCOPE, "file.requested") { mapOf("file" to id.shortLabel, "at" to id.timestamp.epochSecond, "remaining" to queue.size) }
    send(health(FETCH_FILE, ProtoWriter().bytes(2, id.bytes)))
    handler.postDelayed(timeout, FILE_TIMEOUT_MS)
  }

  private fun fileTimedOut() {
    val id = current
    NativeLog.warn(SCOPE, "file.timeout") { mapOf("file" to id?.shortLabel, "awaitingPast" to awaitingPast, "queued" to queue.size, "timeoutMs" to FILE_TIMEOUT_MS) }
    if (id == null && awaitingPast) {
      awaitingPast = false
      sink.note("sync_list_timeout", "the watch did not list earlier files within ${FILE_TIMEOUT_MS / 1000} s")
      next()
      return
    }
    sink.note("sync_file_timeout", "${id?.label ?: "file list"}: no data within ${FILE_TIMEOUT_MS / 1000} s")
    next()
  }

  private fun finish() {
    handler.removeCallbacks(timeout)
    val files = parsed.toList()
    parsed.clear()
    NativeLog.info(SCOPE, "sync.parsed", NativeLog.elapsedMs(startedAt)) { mapOf("files" to files.size) }
    sink.synced(files.map { it.second }) { keep ->
      handler.post {
        if (keep != null) {
          files.filter { (id, _) -> id.key !in keep }.forEach { (id, _) -> send(health(ACK, ProtoWriter().bytes(3, id.bytes))) }
        }
        running = false
      }
    }
  }

  private fun health(subtype: Int, body: ProtoWriter?): ByteArray {
    val command = ProtoWriter().varint(1, XiaomiCommands.TYPE_HEALTH.toLong()).varint(2, subtype.toLong())
    if (body != null) command.message(XiaomiCommand.HEALTH, body)
    return command.toByteArray()
  }

  companion object {
    const val FETCH_TODAY = 1
    const val FETCH_PAST = 2
    const val FETCH_FILE = 3
    const val ACK = 5
    private const val SCOPE = "watch-sync"
    private const val FILE_TIMEOUT_MS = 10_000L
  }
}

object XiaomiFileParser {
  fun parse(id: XiaomiFileId, file: ByteArray): WatchFile {
    val tz = id.zoneOffsetSeconds
    if (id.type == XiaomiFileId.SPORTS) {
      return when (id.detail) {
        XiaomiFileId.SUMMARY -> WatchFile(id.key, id.label, tz, workouts = XiaomiWorkoutParser.summary(id, file))
        XiaomiFileId.GPS -> WatchFile(id.key, id.label, tz, routes = XiaomiGpsParser.route(id, file))
        else -> throw UnsupportedFile(id, "per-second workout details are read in a later update")
      }
    }
    return when {
      id.subtype == XiaomiFileId.DAILY && id.detail == XiaomiFileId.DETAILS ->
        WatchFile(id.key, id.label, tz, minutes = XiaomiDailyParsers.details(id, file))
      id.subtype == XiaomiFileId.DAILY && id.detail == XiaomiFileId.SUMMARY ->
        XiaomiDailyParsers.summary(id, file).let {
          WatchFile(id.key, id.label, tz, resting = it.resting, samples = it.vitality)
        }
      id.subtype == XiaomiFileId.MANUAL -> WatchFile(id.key, id.label, tz, spots = XiaomiDailyParsers.manual(id, file))
      id.subtype == XiaomiFileId.SLEEP -> WatchFile(id.key, id.label, tz, sleeps = XiaomiSleepParsers.details(id, file))
      id.subtype == XiaomiFileId.SLEEP_STAGES -> WatchFile(id.key, id.label, tz, sleeps = XiaomiSleepParsers.stagesFile(id, file))
      else -> throw UnsupportedFile(id, "this app has no reader for this file type")
    }
  }
}
