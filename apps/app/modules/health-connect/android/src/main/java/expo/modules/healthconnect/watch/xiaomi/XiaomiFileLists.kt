package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.CaptureOutcome
import expo.modules.healthconnect.watch.WatchCapture

object XiaomiFileLists {
  const val PAST_WINDOW = 10
  private const val ID_BYTES = 7
  private const val FAMILY = "xiaomi"

  fun raw(source: String, ids: ByteArray): String {
    val entries = (0 until ids.size / ID_BYTES).map { XiaomiFileId(ids.copyOfRange(it * ID_BYTES, it * ID_BYTES + ID_BYTES)) }
    val listed = entries.joinToString("; ") { "${it.key} ${it.shortLabel} ${it.timestamp}${if (it.empty) " (empty id)" else ""}" }
    return "the watch listed ${entries.size} file id(s) from $source in ${ids.size} bytes: ${listed.ifEmpty { "none" }}"
  }

  fun windowFull(listed: List<XiaomiFileId>): Boolean = listed.size >= PAST_WINDOW

  fun windowText(listed: Int, kept: Int): String =
    "the watch lists at most $PAST_WINDOW earlier files at a time and listed $listed ($kept kept on the watch from earlier syncs); newer earlier files appear only after these are acknowledged"

  fun capture(id: XiaomiFileId, file: ByteArray, outcome: CaptureOutcome, note: String?): WatchCapture =
    WatchCapture(id.key, FAMILY, id.type, id.subtype, id.detail, id.version, id.timestamp, outcome, note, file)
}
