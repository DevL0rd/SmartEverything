package expo.modules.healthconnect

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

inline fun <reified T> Any?.expectIs(): T {
  if (this is T) return this
  throw AssertionError("expected ${T::class.simpleName} but was $this")
}

fun hex(text: String): ByteArray = text.replace(" ", "").chunked(2).map { it.toInt(16).toByte() }.toByteArray()

class LittleEndianBytes {
  private val out = ByteArrayOutputStream()

  fun u8(value: Int): LittleEndianBytes = apply { out.write(value and 0xff) }

  fun u16(value: Int): LittleEndianBytes = apply { out.write(buffer(2).putShort(value.toShort()).array()) }

  fun u32(value: Long): LittleEndianBytes = apply { out.write(buffer(4).putInt(value.toInt()).array()) }

  fun u64(value: Long): LittleEndianBytes = apply { out.write(buffer(8).putLong(value).array()) }

  fun f32(value: Float): LittleEndianBytes = apply { out.write(buffer(4).putFloat(value).array()) }

  fun raw(vararg values: Int): LittleEndianBytes = apply { values.forEach { u8(it) } }

  fun raw(bytes: ByteArray): LittleEndianBytes = apply { out.write(bytes) }

  fun toByteArray(): ByteArray = out.toByteArray()

  private fun buffer(size: Int): ByteBuffer = ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN)
}
