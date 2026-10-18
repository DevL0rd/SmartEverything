package expo.modules.healthconnect.listening

import org.junit.Assert.assertEquals
import org.junit.Test

class LevelMeterTest {
  private val reported = ArrayList<Double>()
  private var watched = true
  private val meter = LevelMeter({ watched }, { reported.add(it) })

  @Test
  fun `a level is reported for every 100 ms of audio`() {
    meter.hear(ShortArray(LevelMeter.WINDOW_SAMPLES * 2) { 16_384 })
    assertEquals(2, reported.size)
    assertEquals(-6.02, reported[0], 0.01)
  }

  @Test
  fun `windows are completed across calls`() {
    meter.hear(ShortArray(1000) { 16_384 })
    assertEquals(0, reported.size)
    meter.hear(ShortArray(600) { 16_384 })
    assertEquals(1, reported.size)
  }

  @Test
  fun `nothing is measured while nobody is watching`() {
    watched = false
    meter.hear(ShortArray(LevelMeter.WINDOW_SAMPLES * 3) { 16_384 })
    assertEquals(0, reported.size)
  }

  @Test
  fun `silence is reported at the floor`() {
    meter.hear(ShortArray(LevelMeter.WINDOW_SAMPLES))
    assertEquals(LevelOf.FLOOR_DBFS, reported[0], 0.0)
  }
}
