package expo.modules.healthconnect.drive

import android.os.ProxyFileDescriptorCallback
import android.system.ErrnoException
import android.system.OsConstants
import java.io.IOException

object DriveBlocks {
  const val BLOCK_BYTES = 512 * 1024

  fun first(offset: Long, block: Int = BLOCK_BYTES): Long = offset / block

  fun last(offset: Long, size: Int, length: Long, block: Int = BLOCK_BYTES): Long {
    val end = minOf(offset + size, length)
    return (end - 1) / block
  }

  fun start(index: Long, block: Int = BLOCK_BYTES): Long = index * block

  fun endInclusive(index: Long, length: Long, block: Int = BLOCK_BYTES): Long = minOf((index + 1) * block, length) - 1

  fun wanted(offset: Long, size: Int, length: Long): Int =
    if (offset < 0 || offset >= length || size <= 0) 0 else minOf(size.toLong(), length - offset).toInt()
}

class DriveRangeReader(val length: Long, private val fetch: (start: Long, endInclusive: Long) -> ByteArray) {
  private val blocks = object : LinkedHashMap<Long, ByteArray>(MAX_BLOCKS, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Long, ByteArray>): Boolean = size > MAX_BLOCKS
  }

  @Synchronized
  fun read(offset: Long, size: Int, into: ByteArray): Int {
    val count = DriveBlocks.wanted(offset, size, length)
    if (count == 0) return 0
    var written = 0
    var index = DriveBlocks.first(offset)
    val last = DriveBlocks.last(offset, count, length)
    while (index <= last) {
      val block = block(index)
      val from = maxOf(offset - DriveBlocks.start(index), 0L).toInt()
      val take = minOf(block.size - from, count - written)
      block.copyInto(into, written, from, from + take)
      written += take
      index++
    }
    return written
  }

  private fun block(index: Long): ByteArray = blocks.getOrPut(index) {
    val start = DriveBlocks.start(index)
    val end = DriveBlocks.endInclusive(index, length)
    val bytes = fetch(start, end)
    if (bytes.size.toLong() != end - start + 1) throw IOException("The hub gave ${bytes.size} bytes for a block of ${end - start + 1}")
    bytes
  }

  private companion object {
    const val MAX_BLOCKS = 8
  }
}

class DriveProxyCallback(private val reader: DriveRangeReader, private val closed: () -> Unit) : ProxyFileDescriptorCallback() {
  override fun onGetSize(): Long = reader.length

  override fun onRead(offset: Long, size: Int, data: ByteArray): Int = try {
    reader.read(offset, size, data)
  } catch (failure: IOException) {
    throw ErrnoException("read", OsConstants.EIO, failure)
  }

  override fun onRelease() = closed()
}
