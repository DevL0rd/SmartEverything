package expo.modules.healthconnect.drive

import java.io.IOException
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class DriveRangeReaderTest {
  private val block = DriveBlocks.BLOCK_BYTES

  private fun bytes(length: Int) = ByteArray(length) { (it % 251).toByte() }

  private class Source(val data: ByteArray) {
    val requests = mutableListOf<Pair<Long, Long>>()

    fun fetch(start: Long, end: Long): ByteArray {
      requests.add(start to end)
      return data.copyOfRange(start.toInt(), end.toInt() + 1)
    }
  }

  @Test
  fun `block math covers a read that crosses a boundary`() {
    val length = block * 3L + 10
    assertEquals(0L, DriveBlocks.first(5))
    assertEquals(1L, DriveBlocks.first(block.toLong()))
    assertEquals(1L, DriveBlocks.last(block - 4L, 8, length))
    assertEquals(3L, DriveBlocks.last(block * 3L, 10, length))
    assertEquals(block * 3L, DriveBlocks.start(3))
    assertEquals(length - 1, DriveBlocks.endInclusive(3, length))
    assertEquals(block - 1L, DriveBlocks.endInclusive(0, length))
  }

  @Test
  fun `a read is clipped to the end of the file`() {
    assertEquals(10, DriveBlocks.wanted(90, 50, 100))
    assertEquals(0, DriveBlocks.wanted(100, 50, 100))
    assertEquals(0, DriveBlocks.wanted(-1, 50, 100))
    assertEquals(0, DriveBlocks.wanted(0, 0, 100))
    assertEquals(50, DriveBlocks.wanted(0, 50, 100))
  }

  @Test
  fun `a read inside one block asks the hub for that block once`() {
    val source = Source(bytes(block * 2 + 100))
    val reader = DriveRangeReader(source.data.size.toLong(), source::fetch)
    val out = ByteArray(16)
    assertEquals(16, reader.read(20, 16, out))
    assertArrayEquals(source.data.copyOfRange(20, 36), out)
    assertEquals(16, reader.read(100, 16, out))
    assertEquals(listOf(0L to block - 1L), source.requests)
  }

  @Test
  fun `a read across a boundary joins two blocks`() {
    val source = Source(bytes(block * 2 + 100))
    val reader = DriveRangeReader(source.data.size.toLong(), source::fetch)
    val out = ByteArray(40)
    assertEquals(40, reader.read(block - 20L, 40, out))
    assertArrayEquals(source.data.copyOfRange(block - 20, block + 20), out)
    assertEquals(2, source.requests.size)
  }

  @Test
  fun `the last block is shorter and a read past the end returns what is left`() {
    val source = Source(bytes(block + 30))
    val reader = DriveRangeReader(source.data.size.toLong(), source::fetch)
    val out = ByteArray(100)
    assertEquals(30, reader.read(block.toLong(), 100, out))
    assertArrayEquals(source.data.copyOfRange(block, block + 30), out.copyOf(30))
    assertEquals(0, reader.read(block + 30L, 10, out))
  }

  @Test
  fun `a short answer from the hub is an error`() {
    val reader = DriveRangeReader(1000) { _, _ -> ByteArray(10) }
    assertThrows(IOException::class.java) { reader.read(0, 10, ByteArray(10)) }
  }

  @Test
  fun `only a few blocks are kept`() {
    val source = Source(bytes(block * 12))
    val reader = DriveRangeReader(source.data.size.toLong(), source::fetch)
    val out = ByteArray(4)
    for (index in 0 until 12) reader.read(index * block.toLong(), 4, out)
    reader.read(0, 4, out)
    assertEquals(13, source.requests.size)
  }
}
