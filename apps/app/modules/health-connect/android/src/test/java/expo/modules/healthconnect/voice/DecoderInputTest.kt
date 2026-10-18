package expo.modules.healthconnect.voice

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DecoderInputTest {
  private val queued = mutableListOf<Triple<Int, Int, Long>>()
  private val input = DecoderInput { index, packet, presentationUs -> queued.add(Triple(index, packet.single().toInt(), presentationUs)) }

  @Test
  fun `a packet waits until the decoder has a free input buffer`() {
    input.offer(byteArrayOf(1))
    assertTrue(queued.isEmpty())
    input.available(7)
    assertEquals(listOf(Triple(7, 1, 0L)), queued)
  }

  @Test
  fun `every packet pushed while the decoder is busy is fed in order as buffers free up`() {
    (1..100).forEach { input.offer(byteArrayOf(it.toByte())) }
    (0 until 100).forEach { input.available(it) }
    assertEquals((1..100).toList(), queued.map { it.second })
    assertEquals((0 until 100).toList(), queued.map { it.first })
  }

  @Test
  fun `presentation time advances by one frame per packet`() {
    input.available(0)
    input.available(1)
    input.offer(byteArrayOf(1))
    input.offer(byteArrayOf(2))
    assertEquals(listOf(0L, 20_000L), queued.map { it.third })
  }

  @Test
  fun `a free buffer waits for the next packet`() {
    input.available(3)
    assertTrue(queued.isEmpty())
    input.offer(byteArrayOf(9))
    assertEquals(listOf(Triple(3, 9, 0L)), queued)
  }

  @Test
  fun `reset forgets waiting packets and free buffers`() {
    input.offer(byteArrayOf(1))
    input.reset()
    input.available(5)
    assertTrue(queued.isEmpty())
    input.reset()
    input.offer(byteArrayOf(2))
    assertTrue(queued.isEmpty())
    input.available(6)
    assertEquals(listOf(Triple(6, 2, 0L)), queued)
  }
}
