package expo.modules.healthconnect.treadmill

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StatusPollerTest {
  private val request = StatusRequest("f7a20000a2fd", 1000, 2, listOf(1, 2, 6, 7, 8, 9), 3)
  private val poller = StatusPoller(request)

  private fun frame(state: Int): ByteArray = byteArrayOf(0xf8.toByte(), 0xa2.toByte(), state.toByte())

  private fun requestsOver(seconds: Int): Int = (1..seconds).count { poller.due(it * 1000L) }

  @Test
  fun `a pad that never pushes is not asked while idle and nothing was sent`() {
    poller.heard(frame(0))
    assertEquals(0, requestsOver(60))
  }

  @Test
  fun `a command written to a silent idle pad makes the phone ask until the pad has answered`() {
    poller.heard(frame(0))
    poller.commanded()
    assertEquals(3, requestsOver(10))
  }

  @Test
  fun `an active answer keeps the asking going without any further command`() {
    poller.commanded()
    poller.heard(frame(9))
    assertEquals(30, requestsOver(30))
    poller.heard(frame(0))
    assertEquals(3, requestsOver(30))
  }

  @Test
  fun `a request goes out only on the plan's own beat`() {
    poller.heard(frame(1))
    assertFalse(poller.due(500))
    assertTrue(poller.due(2000))
  }

  @Test
  fun `a frame too short to hold the state byte changes nothing`() {
    poller.heard(byteArrayOf(0xf8.toByte()))
    assertEquals(0, requestsOver(5))
  }
}
