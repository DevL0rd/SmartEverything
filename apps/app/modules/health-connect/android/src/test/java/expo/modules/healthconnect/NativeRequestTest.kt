package expo.modules.healthconnect

import expo.modules.healthconnect.push.ActionAnswer
import expo.modules.healthconnect.watch.AlarmInfo
import expo.modules.healthconnect.watch.FaceInfo
import expo.modules.healthconnect.watch.GoalInfo
import expo.modules.healthconnect.watch.RoutePointWire
import expo.modules.healthconnect.watch.RouteWire
import expo.modules.healthconnect.watch.SampleBatchWire
import expo.modules.healthconnect.watch.SampleWire
import expo.modules.healthconnect.watch.SettingInfo
import expo.modules.healthconnect.watch.SettingValue
import expo.modules.healthconnect.watch.WatchConfigSnapshot
import expo.modules.healthconnect.watch.WatchRecordsRequest
import expo.modules.healthconnect.watch.WatchStateReport
import expo.modules.healthconnect.watch.WorkoutInfo
import expo.modules.healthconnect.watch.WorkoutState
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class NativeRequestTest {
  @Test
  fun `an ingest batch is written the way the hub reads it`() {
    val steps = envelope("hc-1", "Steps", "2026-10-17T10:00:00Z", "2026-10-17T10:05:00Z", 0, "com.other", "2026-10-17T10:06:00Z", "count" to 120)
    val request = IngestRequest(
      listOf(steps),
      listOf("hc-0"),
      listOf("Steps", "Weight"),
      IngestSource("samsung SM-F966B", "1.0.0")
    )
    assertEquals(WireFixture.request("ingest"), WireFixture.encode(request))
  }

  @Test
  fun `an outbox acknowledgement names what was written, failed and deleted`() {
    val ack = OutboxAck(
      written = listOf(Written("6f1c1b0e-3b1f-4f0e-9a52-0a6b7a3f0c11", 2)),
      entries = listOf(Written("0d3f5a77-52b1-4bd1-8c0f-3d2a1e9b7a10", 1)),
      failed = listOf(EntryFailure("0d3f5a77-52b1-4bd1-8c0f-3d2a1e9b7a11", 1, "Health Connect refused it")),
      deletedInHealthConnect = listOf("se-entry-0d3f5a77-52b1-4bd1-8c0f-3d2a1e9b7a10-Hydration")
    )
    assertEquals(WireFixture.request("outboxAck"), WireFixture.encode(ack))
  }

  @Test
  fun `a phone or watch action answer is written the way the hub reads it`() {
    val phone = ActionAnswer("3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73", true, "Media volume set to 40%.")
    assertEquals(WireFixture.request("phoneActionAnswer"), WireFixture.encode(phone))
    val longDetail = "x".repeat(2_000)
    val watch = ActionAnswer("9a4e7c18-2d35-4b60-a1f7-6c0b3e8d5f24", false, longDetail)
    assertEquals(longDetail, (WireFixture.encode(watch) as JsonObject)["detail"]?.let { (it as JsonPrimitive).content })
  }

  @Test
  fun `an acknowledgement leaves out the lists it has nothing for`() {
    val encoded = WireFixture.encode(OutboxAck(written = listOf(Written("a", 1))))
    assertEquals(setOf("written"), (encoded as JsonObject).keys)
  }

  @Test
  fun `bluetooth adverts are written with their frame time`() {
    val advert = BleAdvert(
      "AA:BB:CC:DD:EE:FF",
      "0000fe95-0000-1000-8000-00805f9b34fb",
      "40200102030405",
      -61,
      Instant.parse("2026-10-17T07:30:00Z")
    )
    assertEquals(WireFixture.request("bleAdverts"), WireFixture.encode(BleAdvertRequest(listOf(advert))))
  }

  @Test
  fun `a watch state with its configuration and workout is written the way the hub reads it`() {
    assertEquals(WireFixture.request("watchState"), WireFixture.encode(fullState()))
  }

  @Test
  fun `a bare watch state keeps its nulls and leaves out the configuration and workout`() {
    val bare = WatchStateReport("waiting", null, null, null, null, null, null, null, "Bluetooth is off", "2026-10-17T07:10:00Z")
    assertEquals(WireFixture.request("watchStateBare"), WireFixture.encode(bare))
  }

  @Test
  fun `watch records are uploaded with samples and routes`() {
    val record = envelope(
      "watch:dev:file:Steps:1760695200", "Steps", "2026-10-17T10:00:00Z", "2026-10-17T10:59:00Z", 3600,
      "smarteverything.watch", "2026-10-17T11:00:00Z", "count" to 900
    )
    val samples = SampleBatchWire("stress", 3600, listOf(SampleWire(Instant.parse("2026-10-17T10:00:00Z"), 30)))
    val point = RoutePointWire(Instant.parse("2026-10-17T06:00:05Z"), 52.5, 13.4, 34.5, null)
    val route = RouteWire(Instant.parse("2026-10-17T06:00:00Z"), listOf(point))
    assertEquals(WireFixture.request("watchRecords"), WireFixture.encode(WatchRecordsRequest(listOf(record), listOf(samples), listOf(route))))
  }

  @Test
  fun `an upload of only samples still carries an empty record list`() {
    val encoded = WireFixture.encode(WatchRecordsRequest(emptyList(), samples = listOf(SampleBatchWire("stress", 0, emptyList()))))
    assertEquals(setOf("records", "samples"), (encoded as JsonObject).keys)
    assertFalse(encoded.containsKey("routes"))
  }

  private fun fullState(): WatchStateReport {
    val settings = listOf(
      SettingInfo("display.always_on", "Display", "Always on", null, SettingValue.Flag(true)),
      SettingInfo("sleep.start", "Sleep", "Bedtime", "When sleep tracking begins", SettingValue.Clock(22, 30)),
      SettingInfo(
        "display.language", "Display", "Language", null, SettingValue.Pick("en"),
        listOf("en" to "English", "de" to "German")
      )
    )
    val config = WatchConfigSnapshot(
      settings,
      listOf(AlarmInfo(1, 6, 45, true, listOf("mon", "tue"), false)),
      listOf(FaceInfo("classic", "Classic", active = true, removable = false)),
      listOf(GoalInfo("steps", 8000, 8000, true)),
      listOf("treadmill", "yoga")
    )
    val workout = WorkoutInfo(
      sport = "outdoor_running",
      state = WorkoutState.RUNNING,
      startedAt = Instant.parse("2026-10-17T06:00:00Z"),
      startedFromPhone = true,
      heartRate = 140,
      kcal = 90,
      steps = 1500,
      distanceM = 1200,
      updatedAt = Instant.parse("2026-10-17T06:10:00Z")
    )
    return WatchStateReport(
      "connected", 80, false, true, "2.1.0", 4200, 71, "2026-10-17T07:00:00Z", null, "2026-10-17T07:10:00Z",
      config.wire(), workout.wire()
    )
  }

  private fun envelope(
    id: String,
    type: String,
    start: String,
    end: String,
    zone: Int,
    app: String,
    modified: String,
    vararg data: Pair<String, Int>
  ) = HealthEnvelope(
    id, type, Instant.parse(start), Instant.parse(end), zone, app, Instant.parse(modified),
    JsonObject(data.associate { (name, value) -> name to JsonPrimitive(value) })
  )
}
