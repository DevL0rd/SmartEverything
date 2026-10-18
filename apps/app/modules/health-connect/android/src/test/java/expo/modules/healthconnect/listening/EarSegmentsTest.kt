package expo.modules.healthconnect.listening

import android.content.Context
import expo.modules.healthconnect.voice.FakeVad
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Test

class EarSegmentsTest {
  @Test
  fun `the voice detector waits the end-of-speech pause the hub sent`() {
    EarSegments(mockk<Context>(), 640, {}, vads = ::FakeVad).close()
    assertEquals(640, FakeVad.lastSilenceMs)
    EarSegments(mockk<Context>(), 2500, {}, vads = ::FakeVad).close()
    assertEquals(2500, FakeVad.lastSilenceMs)
  }
}
