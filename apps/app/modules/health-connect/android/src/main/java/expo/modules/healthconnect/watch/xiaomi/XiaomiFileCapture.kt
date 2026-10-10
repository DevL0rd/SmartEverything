package expo.modules.healthconnect.watch.xiaomi

object XiaomiFileCapture {
  const val CAPTURE_BYTES = 2400
  const val LINE_BYTES = 96

  fun lines(id: XiaomiFileId, file: ByteArray): List<String> {
    val kept = minOf(file.size, CAPTURE_BYTES)
    val parts = (kept + LINE_BYTES - 1) / LINE_BYTES
    return (0 until parts).map { part ->
      val from = part * LINE_BYTES
      val to = minOf(from + LINE_BYTES, kept)
      "${id.shortLabel} id=${id.key} size=${file.size} part ${part + 1}/$parts @$from: ${spaced(file, from, to)}"
    }
  }

  fun kindOf(id: XiaomiFileId): String = "${id.type}-${id.subtype}-${id.detail}-v${id.version}"

  private fun spaced(file: ByteArray, from: Int, to: Int): String =
    (from until to).joinToString(" ") { "%02x".format(file[it].toInt() and 0xff) }
}
