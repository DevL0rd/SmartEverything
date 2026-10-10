package expo.modules.healthconnect.watch.xiaomi

import java.nio.ByteBuffer
import java.nio.ByteOrder

enum class XiaomiChannel { VERSION, COMMAND, AUTHENTICATION, ACTIVITY, DATA, UNKNOWN }

sealed class Parsed {
  object Incomplete : Parsed()
  object Invalid : Parsed()
  class Complete(val size: Int, val frame: Frame?) : Parsed()
}

sealed class Frame {
  class V1(val channel: XiaomiChannel, val dataType: Int, val payload: ByteArray) : Frame()
  class SessionConfig(val opCode: Int) : Frame()
  class Data(val sequence: Int, val channel: XiaomiChannel, val opCode: Int, val payload: ByteArray) : Frame()
  class Ack(val sequence: Int) : Frame()
  class Nack(val sequence: Int) : Frame()
}

object SppV1 {
  private val PREAMBLE = byteArrayOf(0xba.toByte(), 0xdc.toByte(), 0xfe.toByte())
  private const val EPILOGUE: Byte = 0xef.toByte()
  private const val HEADER = 8
  const val OPCODE_READ = 0
  const val OPCODE_SEND = 2
  const val DATA_PLAIN = 0
  const val DATA_ENCRYPTED = 1
  const val DATA_AUTH = 2

  fun rawChannel(channel: XiaomiChannel): Int = when (channel) {
    XiaomiChannel.VERSION -> 0
    XiaomiChannel.COMMAND, XiaomiChannel.AUTHENTICATION -> 2
    XiaomiChannel.ACTIVITY -> 3
    XiaomiChannel.DATA -> 5
    XiaomiChannel.UNKNOWN -> 0x0f
  }

  private fun channelOf(raw: Int): XiaomiChannel = when (raw) {
    0 -> XiaomiChannel.VERSION
    1, 2 -> XiaomiChannel.COMMAND
    3 -> XiaomiChannel.ACTIVITY
    5 -> XiaomiChannel.DATA
    else -> XiaomiChannel.UNKNOWN
  }

  fun encode(channel: XiaomiChannel, opCode: Int, serial: Int, dataType: Int, payload: ByteArray, needsResponse: Boolean): ByteArray {
    val buffer = ByteBuffer.allocate(11 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
    buffer.put(PREAMBLE)
    buffer.put((rawChannel(channel) and 0xf).toByte())
    buffer.put((0x80 or (if (needsResponse) 0x40 else 0)).toByte())
    buffer.putShort((payload.size + 3).toShort())
    buffer.put(opCode.toByte()).put(serial.toByte()).put(dataType.toByte())
    buffer.put(payload)
    buffer.put(EPILOGUE)
    return buffer.array()
  }

  fun parse(bytes: ByteArray): Parsed {
    if (bytes.size < 11) {
      return Parsed.Incomplete
    }
    if (!bytes.copyOfRange(0, 3).contentEquals(PREAMBLE)) {
      return Parsed.Invalid
    }
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    buffer.position(3)
    val channel = buffer.get().toInt() and 0xff
    buffer.get()
    val size = (buffer.short.toInt() and 0xffff) + HEADER
    if (bytes.size < size) {
      return Parsed.Incomplete
    }
    if (bytes[size - 1] != EPILOGUE) {
      return Parsed.Invalid
    }
    buffer.get()
    buffer.get()
    val dataType = buffer.get().toInt() and 0xff
    val payload = bytes.copyOfRange(10, size - 1)
    val raw = if (channel and 0xf0 != 0) 0x0f else channel
    return Parsed.Complete(size, Frame.V1(channelOf(raw), dataType, payload))
  }

  fun nextStart(bytes: ByteArray): Int = (1 until bytes.size).firstOrNull { bytes[it] == PREAMBLE[0] } ?: bytes.size
}

object SppV2 {
  private val PREAMBLE = byteArrayOf(0xa5.toByte(), 0xa5.toByte())
  const val TYPE_NACK = 0
  const val TYPE_ACK = 1
  const val TYPE_SESSION = 2
  const val TYPE_DATA = 3
  const val OPCODE_PLAIN = 1
  const val OPCODE_ENCRYPTED = 2
  const val START_SESSION = 1

  val SESSION_CONFIG: ByteArray = byteArrayOf(
    START_SESSION.toByte(),
    1, 3, 0, 1, 0, 0,
    2, 2, 0, 0, 0xfc.toByte(),
    3, 2, 0, 0x20, 0,
    4, 2, 0, 0x10, 0x27
  )

  fun rawChannel(channel: XiaomiChannel): Int = when (channel) {
    XiaomiChannel.COMMAND, XiaomiChannel.AUTHENTICATION -> 1
    XiaomiChannel.DATA -> 2
    XiaomiChannel.ACTIVITY -> 5
    else -> 0x0f
  }

  fun opCodeFor(channel: XiaomiChannel): Int =
    if (channel == XiaomiChannel.COMMAND || channel == XiaomiChannel.ACTIVITY) OPCODE_ENCRYPTED else OPCODE_PLAIN

  private fun channelOf(raw: Int): XiaomiChannel = when (raw) {
    1 -> XiaomiChannel.COMMAND
    2 -> XiaomiChannel.DATA
    5 -> XiaomiChannel.ACTIVITY
    else -> XiaomiChannel.UNKNOWN
  }

  fun frame(type: Int, sequence: Int, payload: ByteArray): ByteArray =
    ByteBuffer.allocate(8 + payload.size).order(ByteOrder.LITTLE_ENDIAN)
      .put(PREAMBLE)
      .put((type and 0xf).toByte())
      .put(sequence.toByte())
      .putShort(payload.size.toShort())
      .putShort(crc16(payload).toShort())
      .put(payload)
      .array()

  fun parse(bytes: ByteArray): Parsed {
    if (bytes.size < 8) {
      return Parsed.Incomplete
    }
    if (!bytes.copyOfRange(0, 2).contentEquals(PREAMBLE)) {
      return Parsed.Invalid
    }
    val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    buffer.position(2)
    val type = buffer.get().toInt() and 0xf
    val sequence = buffer.get().toInt() and 0xff
    val length = buffer.short.toInt() and 0xffff
    val checksum = buffer.short.toInt() and 0xffff
    if (bytes.size < 8 + length) {
      return Parsed.Incomplete
    }
    val payload = bytes.copyOfRange(8, 8 + length)
    val frame = if (crc16(payload) == checksum) frameOf(type, sequence, payload) else null
    return Parsed.Complete(8 + length, frame)
  }

  private fun frameOf(type: Int, sequence: Int, payload: ByteArray): Frame? = when (type) {
    TYPE_ACK -> Frame.Ack(sequence)
    TYPE_NACK -> Frame.Nack(sequence)
    TYPE_SESSION -> Frame.SessionConfig(if (payload.isEmpty()) -1 else payload[0].toInt() and 0xff)
    TYPE_DATA -> if (payload.size < 2) null else Frame.Data(
      sequence,
      channelOf(payload[0].toInt() and 0xf),
      payload[1].toInt() and 0xff,
      payload.copyOfRange(2, payload.size)
    )
    else -> null
  }

  fun nextStart(bytes: ByteArray): Int = (1 until bytes.size).firstOrNull { bytes[it] == PREAMBLE[0] } ?: bytes.size

  fun crc16(payload: ByteArray): Int {
    var crc = 0
    for (byte in payload) {
      for (bit in 0 until 8) {
        crc = crc shl 1
        if (((crc shr 16) and 1) xor ((byte.toInt() shr bit) and 1) == 1) {
          crc = crc xor 0x8005
        }
      }
    }
    return Integer.reverse(crc) ushr 16
  }
}
