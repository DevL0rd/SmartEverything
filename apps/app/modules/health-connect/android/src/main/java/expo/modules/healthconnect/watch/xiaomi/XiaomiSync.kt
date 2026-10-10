package expo.modules.healthconnect.watch.xiaomi

import android.os.Handler
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
  private val timeout = Runnable { fileTimedOut() }

  val busy: Boolean get() = running

  fun start(reason: String) {
    if (running) {
      sink.note("sync_skipped", "a sync is already running ($reason)")
      return
    }
    running = true
    parsed.clear()
    queue.clear()
    awaitingPast = true
    sink.syncing("Asking the watch for new data ($reason)")
    send(health(FETCH_TODAY, ProtoWriter().message(5, ProtoWriter().varint(1, 0))))
    handler.postDelayed(timeout, FILE_TIMEOUT_MS)
  }

  fun stop() {
    handler.removeCallbacks(timeout)
    running = false
    assembler.reset()
  }

  fun fileList(subtype: Int, ids: ByteArray) {
    handler.removeCallbacks(timeout)
    if (ids.size % 7 != 0) {
      sink.note("sync_list_unreadable", "the watch listed ${ids.size} bytes of file ids, not a multiple of 7")
    }
    val fresh = XiaomiFileId.list(ids).filter { it.key !in skipped }
    fresh.filter { it !in queue }.forEach { queue.add(it) }
    sink.note("sync_files", "${fresh.size} file(s) from ${if (subtype == FETCH_TODAY) "today" else "earlier days"}")
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
      val checked = FileAssembler.checked(file)
      val data = XiaomiFileParser.parse(id, checked)
      parsed.add(id to data)
      sink.note("sync_file_read", "${id.label}: ${data.summary()}")
    } catch (unsupported: UnsupportedFile) {
      skipped.add(id.key)
      sink.note("sync_file_unsupported", "${unsupported.message}; left on the watch")
    } catch (failure: IllegalArgumentException) {
      sink.note("sync_file_unreadable", "${id.label}: ${failure.message}; left on the watch")
    } catch (failure: java.nio.BufferUnderflowException) {
      sink.note("sync_file_unreadable", "${id.label}: the file ended early; left on the watch")
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
    send(health(FETCH_FILE, ProtoWriter().bytes(2, id.bytes)))
    handler.postDelayed(timeout, FILE_TIMEOUT_MS)
  }

  private fun fileTimedOut() {
    val id = current
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
      else -> throw UnsupportedFile(id, "Gadgetbridge has no parser for this file")
    }
  }
}
