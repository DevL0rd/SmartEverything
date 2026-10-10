package expo.modules.healthconnect.watch

import java.io.ByteArrayOutputStream

class ProtoFormatError(detail: String) : IllegalArgumentException("Malformed protobuf: $detail")

class ProtoWriter {
  private val out = ByteArrayOutputStream()

  fun varint(field: Int, value: Long): ProtoWriter {
    tag(field, VARINT)
    raw(value)
    return this
  }

  fun sint(field: Int, value: Int): ProtoWriter = varint(field, ((value shl 1) xor (value shr 31)).toLong() and 0xffffffffL)

  fun bytes(field: Int, value: ByteArray): ProtoWriter {
    tag(field, LENGTH)
    raw(value.size.toLong())
    out.write(value)
    return this
  }

  fun string(field: Int, value: String): ProtoWriter = bytes(field, value.toByteArray(Charsets.UTF_8))

  fun message(field: Int, value: ProtoWriter): ProtoWriter = bytes(field, value.toByteArray())

  fun float(field: Int, value: Float): ProtoWriter {
    tag(field, FIXED32)
    val bits = value.toRawBits()
    for (shift in 0 until 32 step 8) {
      out.write((bits ushr shift) and 0xff)
    }
    return this
  }

  fun toByteArray(): ByteArray = out.toByteArray()

  private fun tag(field: Int, wire: Int) = raw(((field shl 3) or wire).toLong())

  private fun raw(value: Long) {
    var rest = value
    while (rest and 0x7fL.inv() != 0L) {
      out.write(((rest and 0x7f) or 0x80).toInt())
      rest = rest ushr 7
    }
    out.write(rest.toInt())
  }

  companion object {
    const val VARINT = 0
    const val FIXED64 = 1
    const val LENGTH = 2
    const val FIXED32 = 5
  }
}

class ProtoMessage(private val fields: Map<Int, List<Any>>) {
  fun has(field: Int): Boolean = fields.containsKey(field)

  fun varint(field: Int): Long? = fields[field]?.filterIsInstance<Long>()?.lastOrNull()

  fun int(field: Int): Int? = varint(field)?.toInt()

  fun bool(field: Int): Boolean? = varint(field)?.let { it != 0L }

  fun bytes(field: Int): ByteArray? = fields[field]?.filterIsInstance<ByteArray>()?.lastOrNull()

  fun string(field: Int): String? = bytes(field)?.toString(Charsets.UTF_8)

  fun message(field: Int): ProtoMessage? = bytes(field)?.let { parseProto(it) }

  fun fieldNumbers(): Set<Int> = fields.keys

  fun all(field: Int): List<ByteArray> = fields[field]?.filterIsInstance<ByteArray>().orEmpty()
}

private class ProtoCursor(private val bytes: ByteArray) {
  var position = 0

  fun more(): Boolean = position < bytes.size

  fun varint(): Long {
    var result = 0L
    var shift = 0
    while (true) {
      if (position >= bytes.size || shift > MAX_SHIFT) {
        throw ProtoFormatError("varint runs past the end at byte $position")
      }
      val byte = bytes[position++].toInt() and 0xff
      result = result or ((byte and 0x7f).toLong() shl shift)
      if (byte and 0x80 == 0) {
        return result
      }
      shift += 7
    }
  }

  fun take(count: Int): ByteArray {
    if (count < 0 || position + count > bytes.size) {
      throw ProtoFormatError("field of $count bytes at $position overruns ${bytes.size} bytes")
    }
    val slice = bytes.copyOfRange(position, position + count)
    position += count
    return slice
  }

  fun fixed(count: Int): Long = take(count).foldIndexed(0L) { index, value, byte ->
    value or ((byte.toLong() and 0xff) shl (8 * index))
  }

  private companion object {
    const val MAX_SHIFT = 63
  }
}

fun parseProto(bytes: ByteArray): ProtoMessage {
  val cursor = ProtoCursor(bytes)
  val fields = mutableMapOf<Int, MutableList<Any>>()
  while (cursor.more()) {
    val key = cursor.varint()
    val field = (key ushr 3).toInt()
    val value: Any = when (val wire = (key and 0x7).toInt()) {
      ProtoWriter.VARINT -> cursor.varint()
      ProtoWriter.FIXED64 -> cursor.fixed(8)
      ProtoWriter.LENGTH -> cursor.take(cursor.varint().toInt())
      ProtoWriter.FIXED32 -> cursor.fixed(4)
      else -> throw ProtoFormatError("wire type $wire for field $field is not supported")
    }
    fields.getOrPut(field) { mutableListOf() }.add(value)
  }
  return ProtoMessage(fields)
}
