package expo.modules.healthconnect.listening

import org.junit.Assert.assertEquals
import org.junit.Test

class DefaultNetworkTrackerTest {
  private var changes = 0
  private val tracker = DefaultNetworkTracker<String> { changes += 1 }

  @Test
  fun `the first network seen is the baseline`() {
    tracker.available("wifi")
    assertEquals(0, changes)
  }

  @Test
  fun `a repeat of the same network is not a change`() {
    tracker.available("wifi")
    tracker.available("wifi")
    assertEquals(0, changes)
  }

  @Test
  fun `switching to another network is a change`() {
    tracker.available("wifi")
    tracker.available("cell")
    assertEquals(1, changes)
  }

  @Test
  fun `losing the current network is a change and a new one after it is another`() {
    tracker.available("wifi")
    tracker.lost("wifi")
    assertEquals(1, changes)
    tracker.available("wifi2")
    assertEquals(2, changes)
  }

  @Test
  fun `losing an old network is not a change`() {
    tracker.available("wifi")
    tracker.available("cell")
    changes = 0
    tracker.lost("wifi")
    assertEquals(0, changes)
  }
}
