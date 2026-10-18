package expo.modules.healthconnect.voice

import org.junit.Assert.assertEquals
import org.junit.Test

class SpeechHysteresisTest {
  private fun run(hysteresis: SpeechHysteresis, voiced: String): String =
    voiced.map { if (hysteresis.update(it == 'v')) 's' else '.' }.joinToString("")

  @Test
  fun `speech is confirmed after the minimum voiced run and held through short gaps`() {
    assertEquals(".ssssssss", run(SpeechHysteresis(64, 96), "vvvv.vv.."))
  }

  @Test
  fun `speech ends after the silence pause`() {
    assertEquals("sssss.", run(SpeechHysteresis(0, 64), "vvvv.."))
  }

  @Test
  fun `zero durations follow every frame`() {
    assertEquals("s.s.", run(SpeechHysteresis(0, 0), "v.v."))
  }
}
