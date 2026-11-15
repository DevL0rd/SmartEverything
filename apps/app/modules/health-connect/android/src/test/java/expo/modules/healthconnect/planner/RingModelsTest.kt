package expo.modules.healthconnect.planner

import java.time.Instant
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class RingModelsTest {
  private val hubSet = """
    {
      "hash": "abc123",
      "rings": [
        {
          "ringKey": "alarm:11111111-1111-4111-8111-111111111111",
          "kind": "alarm",
          "refId": "11111111-1111-4111-8111-111111111111",
          "dueAt": "2026-11-15T07:00:00.000Z",
          "sound": {"kind": "file", "item_id": "22222222-2222-4222-8222-222222222222", "name": "Morning.mp3", "etag": "v7"},
          "rampSeconds": 30,
          "vibrate": true,
          "snoozeLimit": 3,
          "challenge": {"kind": "maths", "difficulty": "hard", "count": 4},
          "label": "Wake"
        },
        {
          "ringKey": "alarm:33333333-3333-4333-8333-333333333333",
          "kind": "alarm",
          "refId": "33333333-3333-4333-8333-333333333333",
          "dueAt": "2026-11-15T08:00:00.000Z",
          "sound": {"kind": "radio", "station_id": "s1", "name": "Jazz FM", "url": "https://radio.example/stream"},
          "rampSeconds": 0,
          "vibrate": false,
          "snoozeLimit": null,
          "challenge": {"kind": "qr", "code": "kitchen-fridge"},
          "label": null
        },
        {
          "ringKey": "timer:44444444-4444-4444-8444-444444444444",
          "kind": "timer",
          "refId": "44444444-4444-4444-8444-444444444444",
          "dueAt": "2026-11-14T12:10:00.000Z",
          "sound": {"kind": "tone", "id": "default"},
          "rampSeconds": 0,
          "vibrate": true,
          "snoozeLimit": null,
          "challenge": {"kind": "steps", "steps": 40},
          "label": null
        }
      ],
      "bedtimeWindows": [
        {"windDownAt": "2026-11-14T21:30:00.000Z", "bedAt": "2026-11-14T22:00:00.000Z", "wakeAt": "2026-11-15T06:00:00.000Z"}
      ]
    }
  """.trimIndent()

  @Test fun aRingSetAsTheHubSendsItParsesWithEveryNewField() {
    val set = RingSet.parse(hubSet)
    assertEquals("abc123", set.hash)
    assertEquals(3, set.rings.size)
    val file = set.rings[0]
    assertTrue(file.sound is RingSound.File)
    assertEquals("Morning.mp3", (file.sound as RingSound.File).name)
    assertEquals(3, file.snoozeLimit)
    assertTrue(file.challenge is RingChallenge.Maths)
    assertEquals(MathsDifficulty.HARD, (file.challenge as RingChallenge.Maths).difficulty)
    assertNull(file.rule)
    val radio = set.rings[1]
    assertEquals("https://radio.example/stream", (radio.sound as RingSound.Radio).url)
    assertNull(radio.snoozeLimit)
    assertEquals("kitchen-fridge", (radio.challenge as RingChallenge.Qr).code)
    assertEquals(40, (set.rings[2].challenge as RingChallenge.Steps).steps)
    assertEquals(Instant.parse("2026-11-14T21:30:00Z"), set.bedtimeWindows.single().windDownAt)
  }

  @Test fun everyRingSurvivesTheJsonRoundTrip() {
    val set = RingSet.parse(hubSet)
    set.rings.forEach { assertEquals(it, PhoneRing.of(it.toJson())) }
  }

  @Test fun aRingStateKeepsItsSnoozeCounts() {
    val set = RingSet.parse(hubSet)
    val state = RingState("client", "abc123", set.rings, mapOf("alarm:1" to 123L), setOf("timer:1"), mapOf("alarm:1" to 2))
    val back = RingState.of(JSONObject(state.toJson().toString()))
    assertEquals(mapOf("alarm:1" to 2), back.snoozes)
    assertEquals(set.rings, back.rings)
    assertEquals(setOf("timer:1"), back.settled)
  }

  @Test fun anUnknownSoundOrChallengeKindIsRefused() {
    assertThrows(IllegalArgumentException::class.java) { RingSound.of(JSONObject("""{"kind":"spotify"}""")) }
    assertThrows(IllegalArgumentException::class.java) { RingChallenge.of(JSONObject("""{"kind":"shake"}""")) }
    assertThrows(IllegalArgumentException::class.java) { MathsDifficulty.of("brutal") }
  }

  @Test fun onlyAChallengeBlocksTheStopAction() {
    assertFalse(RingChallenge.None.blocksStop)
    assertTrue(RingChallenge.Maths(MathsDifficulty.EASY, 1).blocksStop)
    assertTrue(RingChallenge.Qr("x").blocksStop)
    assertTrue(RingChallenge.Steps(10).blocksStop)
  }

  @Test fun aChallengeNeedsAPositiveTarget() {
    assertThrows(IllegalArgumentException::class.java) { RingChallenge.Maths(MathsDifficulty.EASY, 0) }
    assertThrows(IllegalArgumentException::class.java) { RingChallenge.Steps(0) }
    assertThrows(IllegalArgumentException::class.java) { RingChallenge.Qr("") }
  }

  @Test fun aBedtimeWindowMustBeOrdered() {
    val bed = Instant.parse("2026-11-14T22:00:00Z")
    assertThrows(IllegalArgumentException::class.java) { BedtimeWindow(bed.plusSeconds(60), bed, bed.plusSeconds(3600)) }
    assertThrows(IllegalArgumentException::class.java) { BedtimeWindow(bed, bed, bed) }
    BedtimeWindow(bed, bed, bed.plusSeconds(3600))
  }

  @Test fun aTimerRingMayNotCarryARuleButAnAlarmMayOmitIt() {
    assertThrows(IllegalArgumentException::class.java) {
      PhoneRing(
        "t", RingKind.TIMER, "r", Instant.EPOCH, RingSound.Tone("default"), 0, true, null,
        AlarmRule(java.time.LocalTime.NOON, emptySet(), null, null)
      )
    }
    PhoneRing("a", RingKind.ALARM, "r", Instant.EPOCH, RingSound.Tone("default"), 0, true, null, null)
  }
}
