package expo.modules.healthconnect.planner

import kotlin.math.abs
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NoiseGeneratorTest {
  private fun samples(colour: NoiseColour, seed: Long = 42, count: Int = 50_000): ShortArray =
    ShortArray(count).also { NoiseGenerator(colour, seed).fill(it) }

  private fun roughness(buffer: ShortArray): Double {
    var change = 0.0
    var level = 0.0
    for (index in 1 until buffer.size) {
      change += abs(buffer[index] - buffer[index - 1]).toDouble()
      level += abs(buffer[index].toDouble())
    }
    return change / level
  }

  @Test fun everyColourStaysInsideTheSampleRangeAndNeverSilent() {
    NoiseColour.entries.forEach { colour ->
      val buffer = samples(colour)
      assertTrue(buffer.any { it.toInt() != 0 })
      assertTrue(buffer.all { abs(it.toInt()) <= Short.MAX_VALUE / 2 + 1 })
    }
  }

  @Test fun noiseCentresOnSilenceWithoutADcOffset() {
    NoiseColour.entries.forEach { colour ->
      val mean = samples(colour).map { it.toDouble() }.average() / Short.MAX_VALUE
      assertTrue("$colour mean $mean", abs(mean) < 0.1)
    }
  }

  @Test fun whiteIsRougherThanPinkAndPinkIsRougherThanBrown() {
    val white = roughness(samples(NoiseColour.WHITE))
    val pink = roughness(samples(NoiseColour.PINK))
    val brown = roughness(samples(NoiseColour.BROWN))
    assertTrue("white $white pink $pink", white > pink * 1.5)
    assertTrue("pink $pink brown $brown", pink > brown * 1.5)
  }

  @Test fun theSameSeedGivesTheSameNoiseAndAnotherSeedDoesNot() {
    assertArrayEquals(samples(NoiseColour.PINK, 7, 1_000), samples(NoiseColour.PINK, 7, 1_000))
    assertFalse(samples(NoiseColour.PINK, 7, 1_000).contentEquals(samples(NoiseColour.PINK, 8, 1_000)))
  }

  @Test fun theColourWiresRoundTrip() {
    assertEquals(NoiseColour.BROWN, NoiseColour.of("brown"))
  }
}
