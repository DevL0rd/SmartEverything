package expo.modules.healthconnect.planner

import org.junit.Assert.assertEquals
import org.junit.Test

class StepTallyTest {
  @Test fun countingStartsAtTheFirstReading() {
    val tally = StepTally()
    assertEquals(0, tally.update(5_000f))
    assertEquals(7, tally.update(5_007f))
    assertEquals(40, tally.update(5_040f))
  }

  @Test fun aCounterResetBelowTheBaselineNeverGoesNegative() {
    val tally = StepTally()
    tally.update(100f)
    assertEquals(0, tally.update(20f))
  }
}
