package expo.modules.healthconnect.listening

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ListeningCountersTest {
  private var now = 0L
  private val lines = ArrayList<String>()
  private val counters = ListeningCounters({ now }, { lines.add(it) })

  @Test
  fun `listening and spotter audio are counted in seconds and the rest is gated off`() {
    counters.heard(16_000 * 10)
    counters.spotterRan(16_000 * 3)
    counters.spotterRan(16_000)
    val snapshot = counters.snapshot()
    assertEquals(10.0, snapshot.getValue("listeningSeconds"), 0.0)
    assertEquals(4.0, snapshot.getValue("spotterSeconds"), 0.0)
    assertEquals(6.0, snapshot.getValue("gatedOffSeconds"), 0.0)
    assertEquals(2.0, snapshot.getValue("spotterRuns"), 0.0)
  }

  @Test
  fun `voice openings are counted`() {
    counters.voiceOpened()
    counters.voiceOpened()
    assertEquals(2.0, counters.snapshot().getValue("voiceOpens"), 0.0)
  }

  @Test
  fun `rest time counts a finished rest and the one in progress`() {
    now = 1_000
    counters.restBegan()
    now = 4_000
    counters.restBegan()
    assertEquals(3.0, counters.snapshot().getValue("restedSeconds"), 0.0)
    counters.restEnded()
    now = 9_000
    counters.restEnded()
    assertEquals(3.0, counters.snapshot().getValue("restedSeconds"), 0.0)
  }

  @Test
  fun `one line is logged for every hour of listening`() {
    val hour = 16_000 * 3600
    counters.heard(hour - 1)
    assertEquals(0, lines.size)
    counters.heard(1)
    assertEquals(1, lines.size)
    assertTrue(lines.single().contains("listeningSeconds=3600.0"))
    counters.heard(hour / 2)
    assertEquals(1, lines.size)
    counters.heard(hour / 2)
    assertEquals(2, lines.size)
  }
}
