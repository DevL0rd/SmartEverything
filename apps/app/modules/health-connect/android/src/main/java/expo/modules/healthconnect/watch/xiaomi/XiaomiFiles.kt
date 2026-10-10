package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.toHex
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant
import java.util.zip.CRC32

class UnsupportedFile(val fileId: XiaomiFileId, reason: String) : IllegalArgumentException("${fileId.label}: $reason")

class XiaomiFileId(val bytes: ByteArray) : Comparable<XiaomiFileId> {
  private val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
  val timestamp: Instant = Instant.ofEpochSecond(buffer.getInt(0).toLong() and 0xffffffffL)
  val timezone: Int = bytes[4].toInt()
  val version: Int = bytes[5].toInt() and 0xff
  private val flags = bytes[6].toInt() and 0xff
  val type: Int = (flags shr 7) and 1
  val subtype: Int = (flags and 0x7f) shr 2
  val detail: Int = flags and 3

  val key: String get() = bytes.toHex()

  val zoneOffsetSeconds: Int get() = timezone * QUARTER_HOUR

  val label: String
    get() = "${if (type == SPORTS) "workout" else "activity"} ${subtypeName()} ${detailName()} v$version from $timestamp"

  val shortLabel: String
    get() = "t${type}s${subtype}d${detail}v$version"

  val empty: Boolean get() = timestamp.epochSecond == 0L && version == 0

  val isSleep: Boolean get() = type == ACTIVITY && (subtype == SLEEP || subtype == SLEEP_STAGES)

  private fun fetchOrder(): Int = when (detail) {
    SUMMARY -> 0
    DETAILS -> 1
    GPS -> 2
    else -> 3
  }

  override fun compareTo(other: XiaomiFileId): Int = compareValuesBy(
    this, other, { it.timestamp }, { it.timezone }, { it.type }, { it.subtype }, { it.fetchOrder() }, { it.version }
  )

  private fun subtypeName(): String = if (type == SPORTS) "type 0x%02x".format(subtype) else when (subtype) {
    DAILY -> "daily"
    SLEEP_STAGES -> "sleep stages"
    MANUAL -> "spot readings"
    SLEEP -> "sleep"
    else -> "subtype 0x%02x".format(subtype)
  }

  private fun detailName(): String = when (detail) {
    DETAILS -> "details"
    SUMMARY -> "summary"
    GPS -> "GPS track"
    else -> "detail $detail"
  }

  companion object {
    const val ACTIVITY = 0
    const val SPORTS = 1
    const val DAILY = 0x00
    const val SLEEP_STAGES = 0x03
    const val MANUAL = 0x06
    const val SLEEP = 0x08
    const val DETAILS = 0
    const val SUMMARY = 1
    const val GPS = 2
    private const val QUARTER_HOUR = 900

    fun list(bytes: ByteArray): List<XiaomiFileId> = (0 until bytes.size / 7)
      .map { XiaomiFileId(bytes.copyOfRange(it * 7, it * 7 + 7)) }
      .filter { !it.empty }
  }
}

class FileAssembler {
  private val buffer = java.io.ByteArrayOutputStream()

  fun add(chunk: ByteArray): ByteArray? {
    if (chunk.size < 4) {
      throw IllegalArgumentException("an activity chunk of ${chunk.size} bytes has no header")
    }
    val header = ByteBuffer.wrap(chunk).order(ByteOrder.LITTLE_ENDIAN)
    val total = header.getShort(0).toInt() and 0xffff
    val number = header.getShort(2).toInt() and 0xffff
    if (number == 1) {
      buffer.reset()
    }
    buffer.write(chunk, 4, chunk.size - 4)
    if (number != total) {
      return null
    }
    val file = buffer.toByteArray()
    buffer.reset()
    return file
  }

  fun reset() = buffer.reset()

  companion object {
    const val EMPTY_FILE = 12

    fun checked(file: ByteArray): ByteArray {
      if (file.size < EMPTY_FILE) {
        throw IllegalArgumentException("an activity file of ${file.size} bytes is too short")
      }
      val crc = CRC32().apply { update(file, 0, file.size - 4) }.value
      val expected = ByteBuffer.wrap(file).order(ByteOrder.LITTLE_ENDIAN).getInt(file.size - 4).toLong() and 0xffffffffL
      if (crc != expected) {
        throw IllegalArgumentException("an activity file failed its checksum (%08x, expected %08x)".format(crc, expected))
      }
      return file
    }

    fun body(file: ByteArray): ByteBuffer {
      val buffer = ByteBuffer.wrap(file).order(ByteOrder.LITTLE_ENDIAN)
      buffer.limit(file.size - 4)
      buffer.position(8)
      return buffer
    }

    fun valid(header: ByteArray, index: Int): Boolean =
      index / 8 < header.size && (header[index / 8].toInt() and (1 shl (7 - index % 8))) != 0
  }
}
