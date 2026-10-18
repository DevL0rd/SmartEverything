package expo.modules.healthconnect.calls

import android.os.SystemClock
import io.mockk.every
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test

class IncomingCallTest {
  private var uptime = 5_000_000L

  @Before
  fun setUp() {
    mockkStatic(SystemClock::class)
    every { SystemClock.elapsedRealtime() } answers { uptime }
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `a call whose hub deadline is behind the phone clock still gets the full ring`() {
    val payload = payload().put("expiresAt", "1999-01-01T00:00:00Z").toString()
    val call = IncomingCall.fromPayload(payload)
    assertEquals(IncomingCall.RING_MS, call.remainingMs())
  }

  @Test
  fun `the ring runs down with the monotonic clock`() {
    val call = IncomingCall.fromPayload(payload().toString())
    uptime += 10_000
    assertEquals(IncomingCall.RING_MS - 10_000, call.remainingMs())
    uptime += IncomingCall.RING_MS
    assertEquals(-10_000L, call.remainingMs())
  }

  @Test
  fun `a payload without a caller is refused`() {
    assertThrows(IncomingCallInvalid::class.java) {
      IncomingCall.fromPayload(payload().apply { remove("caller") }.toString())
    }
  }

  private fun payload(): JSONObject = JSONObject()
    .put("outreachId", "call-1")
    .put("chatId", "chat-1")
    .put("caller", "Ada")
    .put("reason", "Dinner is ready")
}
