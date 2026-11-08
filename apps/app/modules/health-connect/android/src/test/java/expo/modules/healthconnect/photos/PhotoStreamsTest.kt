package expo.modules.healthconnect.photos

import java.io.ByteArrayInputStream
import java.io.InputStream
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PhotoStreamsTest {
  @Test fun `hashes source bytes with SHA256`() {
    val answer = PhotoStreams.hash(ByteArrayInputStream("abc".toByteArray())) {}
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", answer["sha256"])
    assertEquals(3L, answer["bytes"])
  }

  @Test fun `hash reads stay bounded and cancellation stops the next block`() {
    var reads = 0
    val source = object : InputStream() {
      override fun read(): Int = error("Hash must read bounded blocks")
      override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        assertTrue(length <= 64 * 1024)
        reads++
        return length
      }
    }
    assertThrows(IllegalStateException::class.java) {
      PhotoStreams.hash(source) { check(reads < 3) { "cancelled" } }
    }
    assertEquals(3, reads)
  }

  @Test fun `reads one bounded range from a virtual twelve GiB movie`() {
    val offset = 12L * 1024 * 1024 * 1024 - 16
    var skipped = 0L
    var bytesRead = 0
    val source = object : InputStream() {
      override fun read(): Int = error("Range must skip to its offset")
      override fun skip(length: Long): Long { skipped += length; return length }
      override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        val count = minOf(length, 3)
        buffer.fill(0x7f, offset, offset + count)
        bytesRead += count
        return count
      }
    }
    assertArrayEquals(ByteArray(16) { 0x7f }, PhotoStreams.range(source, offset, 16) {})
    assertEquals(offset, skipped)
    assertEquals(16, bytesRead)
  }

  @Test fun `refuses ranges larger than the upload chunk before reading`() {
    val source = object : InputStream() {
      override fun read(): Int = error("Must reject before reading")
    }
    assertThrows(IllegalArgumentException::class.java) {
      PhotoStreams.range(source, 0, 4 * 1024 * 1024 + 1) {}
    }
  }

  @Test fun `detects a truncated or changed source`() {
    assertThrows(IllegalStateException::class.java) {
      PhotoStreams.range(ByteArrayInputStream(byteArrayOf(0, 1, 2)), 0, 4) {}
    }
    assertThrows(IllegalStateException::class.java) {
      PhotoStreams.range(ByteArrayInputStream(byteArrayOf(0)), 5, 1) {}
    }
  }

  @Test fun `reads a binary range without changing byte values`() {
    val bytes = byteArrayOf(0, -1, -128, 42)
    assertArrayEquals(byteArrayOf(-1, -128), PhotoStreams.range(ByteArrayInputStream(bytes), 1, 2) {})
  }
}
