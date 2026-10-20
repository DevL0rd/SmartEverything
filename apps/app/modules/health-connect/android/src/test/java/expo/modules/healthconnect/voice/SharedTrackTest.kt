package expo.modules.healthconnect.voice

import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SharedTrackTest {
  private class FakePort : TrackPort {
    @Volatile var released = false
    @Volatile var readAfterRelease = false
    @Volatile var reading = false

    override fun playbackHead(): Long {
      reading = true
      if (released) readAfterRelease = true
      Thread.yield()
      if (released) readAfterRelease = true
      reading = false
      return 5L
    }

    override fun stop() = Unit

    override fun release() {
      check(!reading) { "released while a reader was inside the track" }
      released = true
    }
  }

  @Test
  fun `the head is read while the track is open`() {
    assertEquals(5L, SharedTrack(FakePort()).head())
  }

  @Test
  fun `a closed track reports no head and is released once`() {
    val port = FakePort()
    val track = SharedTrack(port)
    track.close()
    track.close()
    assertNull(track.head())
    assertTrue(port.released)
    assertEquals(false, port.readAfterRelease)
  }

  @Test
  fun `a reader on another thread never reaches the track while it is released`() {
    repeat(200) {
      val port = FakePort()
      val track = SharedTrack(port)
      val failure = AtomicReference<Throwable?>()
      val start = CountDownLatch(1)
      val pool = Executors.newFixedThreadPool(2)
      pool.execute {
        start.await()
        runCatching { repeat(2000) { track.head() } }.onFailure(failure::set)
      }
      pool.execute {
        start.await()
        runCatching { track.close() }.onFailure(failure::set)
      }
      start.countDown()
      pool.shutdown()
      assertTrue(pool.awaitTermination(10, TimeUnit.SECONDS))
      assertNull(failure.get())
      assertEquals(false, port.readAfterRelease)
    }
  }
}
