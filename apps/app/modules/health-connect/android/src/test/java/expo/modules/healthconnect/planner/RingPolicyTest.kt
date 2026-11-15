package expo.modules.healthconnect.planner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class RingPolicyTest {
  private val file = RingSound.File("item", "Morning.mp3", "v1")

  @Test fun theNotificationOffersSnoozeAndStopWhenNothingBlocksThem() {
    assertEquals(listOf(RingAction.SNOOZE, RingAction.STOP), RingActions.of(RingChallenge.None, null))
    assertEquals(listOf(RingAction.SNOOZE, RingAction.STOP), RingActions.of(RingChallenge.None, 2))
  }

  @Test fun aChallengeTakesTheStopActionAway() {
    listOf(RingChallenge.Maths(MathsDifficulty.MEDIUM, 3), RingChallenge.Qr("code"), RingChallenge.Steps(30)).forEach {
      assertEquals(listOf(RingAction.SNOOZE), RingActions.of(it, 1))
    }
  }

  @Test fun noSnoozesLeftTakesTheSnoozeActionAway() {
    assertEquals(listOf(RingAction.STOP), RingActions.of(RingChallenge.None, 0))
    assertEquals(emptyList<RingAction>(), RingActions.of(RingChallenge.Steps(5), 0))
  }

  @Test fun theSnoozeLimitCountsDownAndNullMeansNoLimit() {
    assertNull(SnoozePolicy.left(null, 50))
    assertEquals(3, SnoozePolicy.left(3, 0))
    assertEquals(0, SnoozePolicy.left(3, 3))
    assertEquals(0, SnoozePolicy.left(3, 9))
    assertTrue(SnoozePolicy.allowed(null, 100))
    assertTrue(SnoozePolicy.allowed(2, 1))
    assertFalse(SnoozePolicy.allowed(2, 2))
  }

  @Test fun aCachedFilePlaysFromThePhone() {
    val plan = RingSoundPlan.of(file) { "/files/abc" }
    val source = plan.source as SoundSource.Local
    assertEquals("/files/abc", source.path)
    assertNull(plan.safetyNet)
  }

  @Test fun aFileThatIsNotOnThePhoneFallsBackToTheToneWithAVisibleReason() {
    val plan = RingSoundPlan.of(file) { null }
    assertEquals(RingSound.DEFAULT_TONE, (plan.source as SoundSource.Tone).id)
    assertTrue(plan.safetyNet.orEmpty().contains("Morning.mp3"))
  }

  @Test fun aRadioStationStreamsAndATonePlaysAsIs() {
    val radio = RingSoundPlan.of(RingSound.Radio("s", "Jazz FM", "https://radio.example/s")) { null }
    assertEquals("https://radio.example/s", (radio.source as SoundSource.Stream).url)
    assertNull(radio.safetyNet)
    val tone = RingSoundPlan.of(RingSound.Tone("content://media/alarm/1")) { null }
    assertEquals("content://media/alarm/1", (tone.source as SoundSource.Tone).id)
  }

  @Test fun aFailureAtRingTimeFallsBackToTheDefaultToneAndSaysWhy() {
    val plan = RingSoundPlan.fallback(RingSound.Radio("s", "Jazz FM", "https://radio.example/s"), "the station did not start in 8 seconds")
    assertEquals(RingSound.DEFAULT_TONE, (plan.source as SoundSource.Tone).id)
    assertTrue(plan.safetyNet.orEmpty().contains("Jazz FM"))
    assertTrue(plan.safetyNet.orEmpty().contains("did not start"))
  }
}
