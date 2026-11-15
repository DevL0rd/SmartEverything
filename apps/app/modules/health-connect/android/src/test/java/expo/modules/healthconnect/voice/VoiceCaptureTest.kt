package expo.modules.healthconnect.voice

import android.media.AudioRecord
import io.mockk.every
import io.mockk.mockkConstructor
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class VoiceCaptureTest {
  @Before
  fun recorder() {
    mockkStatic(AudioRecord::class)
    every { AudioRecord.getMinBufferSize(any(), any(), any()) } returns MIN_BUFFER
    mockkConstructor(AudioRecord::class)
    every { anyConstructed<AudioRecord>().state } returns AudioRecord.STATE_INITIALIZED
    every { anyConstructed<AudioRecord>().read(any<ShortArray>(), any(), any()) } returns AudioRecord.ERROR_DEAD_OBJECT
  }

  @After
  fun restore() {
    unmockkAll()
  }

  @Test
  fun `a dead recorder ends the capture once and tells the consumer instead of reading again`() {
    val told = CountDownLatch(1)
    val failure = AtomicReference<VoiceCaptureUnavailable?>(null)
    val capture = VoiceCapture.addConsumer(VoiceCapture.Mode.Ear, { lost ->
      failure.set(lost)
      told.countDown()
    }) { }
    try {
      assertTrue(told.await(WAIT_SECONDS, TimeUnit.SECONDS))
      verify(timeout = WAIT_MS, exactly = 1) { anyConstructed<AudioRecord>().release() }
      verify(exactly = 1) { anyConstructed<AudioRecord>().read(any<ShortArray>(), any(), any()) }
      assertTrue(failure.get()?.reason.orEmpty().contains("${AudioRecord.ERROR_DEAD_OBJECT}"))
    } finally {
      capture.close()
    }
  }

  private companion object {
    const val MIN_BUFFER = 1280
    const val WAIT_SECONDS = 5L
    const val WAIT_MS = 5_000L
  }
}
