package expo.modules.healthconnect.planner

import java.util.Random
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SleepSoundTest {
  @Test fun aNoiseRequestParses() {
    val request = SleepRequest.parse("""{"source":{"kind":"noise","colour":"pink"},"timerMinutes":45,"fadeSeconds":30}""")
    assertEquals(NoiseColour.PINK, (request.source as SleepSource.Noise).colour)
    assertEquals(45 * 60_000L, request.timerMillis)
    assertEquals(30_000L, request.fadeMillis)
    assertEquals("Pink noise", request.source.title)
  }

  @Test fun aFilesRequestKeepsEveryFileAndTheShuffleFlag() {
    val request = SleepRequest.parse(
      """{"source":{"kind":"files","files":[
        {"item_id":"a","name":"Rain.mp3","etag":"1"},{"item_id":"b","name":"Sea.mp3","etag":"2"}],"shuffle":true},
        "timerMinutes":null,"fadeSeconds":0}"""
    )
    val source = request.source as SleepSource.Files
    assertEquals(listOf("a", "b"), source.files.map { it.itemId })
    assertTrue(source.shuffle)
    assertNull(request.timerMillis)
  }

  @Test fun aRadioRequestParses() {
    val request = SleepRequest.parse(
      """{"source":{"kind":"radio","name":"Calm FM","url":"https://calm.example/live"},"timerMinutes":null,"fadeSeconds":10}"""
    )
    assertEquals("https://calm.example/live", (request.source as SleepSource.Radio).url)
    assertEquals("Calm FM", request.source.title)
  }

  @Test fun anUnknownKindOrAnEmptyFileListOrABadTimerIsRefused() {
    assertThrows(IllegalArgumentException::class.java) {
      SleepRequest.parse("""{"source":{"kind":"whale"},"timerMinutes":null,"fadeSeconds":0}""")
    }
    assertThrows(IllegalArgumentException::class.java) {
      SleepRequest.parse("""{"source":{"kind":"files","files":[],"shuffle":false},"timerMinutes":null,"fadeSeconds":0}""")
    }
    assertThrows(IllegalArgumentException::class.java) {
      SleepRequest(SleepSource.Noise(NoiseColour.WHITE), 0, 0)
    }
    assertThrows(IllegalArgumentException::class.java) {
      SleepRequest(SleepSource.Noise(NoiseColour.WHITE), null, -1)
    }
  }

  @Test fun noTimerPlaysAtFullVolumeForever() {
    assertEquals(1f, SleepFade.volume(10_000_000, null, 30_000), 0.0001f)
    assertEquals(false, SleepFade.finished(10_000_000, null))
  }

  @Test fun theFadeStartsBeforeTheTimerEndsAndReachesSilenceAtTheEnd() {
    val timer = 60 * 60_000L
    assertEquals(1f, SleepFade.volume(0, timer, 30_000), 0.0001f)
    assertEquals(1f, SleepFade.volume(timer - 30_000, timer, 30_000), 0.0001f)
    assertEquals(0.5f, SleepFade.volume(timer - 15_000, timer, 30_000), 0.0001f)
    assertEquals(0f, SleepFade.volume(timer, timer, 30_000), 0.0001f)
    assertEquals(false, SleepFade.finished(timer - 1, timer))
    assertEquals(true, SleepFade.finished(timer, timer))
  }

  @Test fun noFadeCutsAtTheTimer() {
    assertEquals(1f, SleepFade.volume(59_999, 60_000, 0), 0.0001f)
    assertEquals(0f, SleepFade.volume(60_000, 60_000, 0), 0.0001f)
  }

  @Test fun anOrderedQueueCyclesInOrder() {
    val queue = SleepQueue(listOf("a", "b", "c"), false)
    assertEquals(listOf("a", "b", "c", "a", "b"), List(5) { queue.next() })
  }

  @Test fun aShuffledQueuePlaysEveryItemOncePerCycle() {
    val queue = SleepQueue(listOf("a", "b", "c", "d"), true, Random(3))
    repeat(3) { assertEquals(setOf("a", "b", "c", "d"), List(4) { queue.next() }.toSet()) }
  }

  @Test fun aQueueNeedsAnItem() {
    assertThrows(IllegalArgumentException::class.java) { SleepQueue(emptyList<String>(), false) }
  }
}
