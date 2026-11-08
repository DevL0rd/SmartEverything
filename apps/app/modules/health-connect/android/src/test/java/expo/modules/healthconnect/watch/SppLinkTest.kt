package expo.modules.healthconnect.watch

import android.content.Context
import android.os.Handler
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test

class SppLinkTest {
  @Test
  fun aLateWriteBeforeTheListenerReceivesClosureDoesNotThrow() {
    val handler = mockk<Handler>()
    val listener = mockk<LinkListener>(relaxed = true)
    every { handler.post(any()) } returns true
    val link = SppLink(mockk<Context>(), "00:00:00:00:00:00", handler, listener)

    link.close()
    link.send(byteArrayOf(1))

    verify(exactly = 1) { handler.post(any()) }
    verify(exactly = 0) { listener.closed(any()) }
  }
}
