package expo.modules.healthconnect.planner

import java.time.Instant
import java.time.LocalTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class RingKeysTest {
  private val alarm = PhoneRing(
    "alarm:1", RingKind.ALARM, "ref", Instant.parse("2026-11-07T07:00:00Z"), "default", 30, true, "Wake",
    AlarmRule(LocalTime.of(7, 0), setOf(1), null, null), 5
  )

  @Test fun aSnoozeKeyMapsBackToItsRing() {
    val key = RingKeys.snoozeOf("alarm:1")
    assertTrue(RingKeys.isSnooze(key))
    assertEquals("alarm:1", RingKeys.baseOf(key))
    assertFalse(RingKeys.isSnooze("alarm:1"))
    assertEquals("alarm:1", RingKeys.baseOf("alarm:1"))
  }

  @Test fun aSnoozedRingIsAOneOffTriggerCarryingTheSameSoundAndLabel() {
    val now = Instant.parse("2026-11-07T07:00:10Z")
    val snoozed = RingSnooze.ringOf(alarm, now, 5)
    assertEquals("alarm:1#snooze", snoozed.ringKey)
    assertEquals(Instant.parse("2026-11-07T07:05:10Z"), NextTrigger.of(snoozed, now, java.time.ZoneId.of("UTC")))
    assertNull(snoozed.rule)
    assertEquals("Wake", snoozed.label)
    assertEquals(30, snoozed.rampSeconds)
  }

  @Test fun theRampStartsAtTheFloorAndReachesFullVolume() {
    assertEquals(RingRamp.FLOOR, RingRamp.volume(0, 30), 0.0001f)
    assertEquals(1f, RingRamp.volume(30_000, 30), 0.0001f)
    assertEquals(1f, RingRamp.volume(90_000, 30), 0.0001f)
    assertEquals(0.525f, RingRamp.volume(15_000, 30), 0.0001f)
  }

  @Test fun noRampMeansFullVolumeAtOnce() {
    assertEquals(1f, RingRamp.volume(0, 0), 0.0001f)
  }

  @Test fun theSnoozeLengthMustBePositiveAndDefaultsWhenTheSetStatesNone() {
    assertThrows(IllegalArgumentException::class.java) {
      PhoneRing("k", RingKind.TIMER, "r", Instant.EPOCH, "default", 0, false, null, null, 0)
    }
    val json = alarm.toJson()
    json.remove("snoozeMinutes")
    assertEquals(PhoneRing.DEFAULT_SNOOZE_MINUTES, PhoneRing.of(json).snoozeMinutes)
  }
}
