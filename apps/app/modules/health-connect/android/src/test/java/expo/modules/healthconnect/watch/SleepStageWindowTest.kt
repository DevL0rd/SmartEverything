package expo.modules.healthconnect.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class SleepStageWindowTest {
  private val bed = Instant.ofEpochSecond(1_700_000_000L)
  private val wake = bed.plusSeconds(8 * 3600)

  private fun at(minutes: Long): Instant = bed.plusSeconds(minutes * 60)

  @Test
  fun `stages are sorted, clipped to the night and overlaps are trimmed`() {
    val fit = SleepStageWindow.fit(
      bed,
      wake,
      listOf(
        SleepStage(at(60), at(120), SleepStages.DEEP),
        SleepStage(at(-30), at(70), SleepStages.LIGHT),
        SleepStage(at(470), at(500), SleepStages.REM)
      )
    )
    assertEquals(listOf(bed to at(70), at(70) to at(120), at(470) to wake), fit.kept.map { it.start to it.end })
    assertEquals(listOf(SleepStages.LIGHT, SleepStages.DEEP, SleepStages.REM), fit.kept.map { it.stage })
    assertEquals(3, fit.changed.size)
    assertTrue(SleepStageWindow.valid(bed, wake, fit.kept))
  }

  @Test
  fun `zero length, fully covered and outside stages are dropped and named`() {
    val fit = SleepStageWindow.fit(
      bed,
      wake,
      listOf(
        SleepStage(at(0), at(100), SleepStages.LIGHT),
        SleepStage(at(10), at(50), SleepStages.DEEP),
        SleepStage(at(200), at(200), SleepStages.REM),
        SleepStage(at(600), at(700), SleepStages.AWAKE)
      )
    )
    assertEquals(listOf(SleepStages.LIGHT), fit.kept.map { it.stage })
    assertEquals(3, fit.changed.count { it.startsWith("dropped") })
  }

  @Test
  fun `valid stages are kept untouched`() {
    val stages = listOf(SleepStage(at(0), at(30), SleepStages.LIGHT), SleepStage(at(30), at(90), SleepStages.DEEP))
    val fit = SleepStageWindow.fit(bed, wake, stages)
    assertEquals(stages, fit.kept)
    assertTrue(fit.changed.isEmpty())
  }
}
