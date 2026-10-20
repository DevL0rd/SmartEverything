package expo.modules.healthconnect

import expo.modules.healthconnect.push.AiSpeechPayload
import expo.modules.healthconnect.push.PhoneActionPayload
import expo.modules.healthconnect.push.WatchActionPayload
import expo.modules.healthconnect.push.pushPayload
import expo.modules.healthconnect.speech.AiSpeechNotice
import expo.modules.healthconnect.watch.PhoneWatches
import expo.modules.healthconnect.watch.WatchData
import expo.modules.healthconnect.watch.WatchRecordsSaved
import java.time.Instant
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeWireTest {
  @Test
  fun `the health outbox decodes readings and entries with their records`() {
    val outbox = WireFixture.decode<HealthOutbox>(WireFixture.response("healthOutbox"))
    val reading = outbox.readings.single()
    assertEquals(72.4, reading.weightKg, 0.0)
    assertNull(reading.basalMetabolicRateKcal)
    assertEquals(61L, reading.heartRate)
    val records = outbox.entries.single().records
    assertEquals(3600, records[0].record?.zoneOffsetSeconds)
    assertEquals("Weight", records[0].recordType.name)
    assertNull(records[1].record)
  }

  @Test
  fun `the health outbox refuses a reading or record that lacks a required field`() {
    refuses<HealthOutbox>("healthOutbox", "readings", 0, "weightKg")
    refuses<HealthOutbox>("healthOutbox", "readings", 0, "bodyFatPercent")
    refuses<HealthOutbox>("healthOutbox", "entries", 0, "records", 0, "clientRecordId")
    refuses<HealthOutbox>("healthOutbox", "entries", 0, "records", 0, "record", "data")
    refuses<HealthOutbox>("healthOutbox", "entries")
  }

  @Test
  fun `the bluetooth watch list decodes and refuses a device without its mask`() {
    val device = WireFixture.decode<BleWatch>(WireFixture.response("bleWatch")).devices.single()
    assertEquals("AA:BB:CC:DD:EE:FF", device.address)
    assertEquals("4020", device.dataPrefix)
    refuses<BleWatch>("bleWatch", "devices", 0, "dataMask")
  }

  @Test
  fun `the relay result decodes and refuses a missing or fractional count`() {
    val result = WireFixture.decode<BleRelayResult>(WireFixture.response("bleRelayResult"))
    assertEquals(2, result.accepted)
    assertEquals(1, result.ignored)
    refuses<BleRelayResult>("bleRelayResult", "ignored")
    val fractional = JsonObject(WireFixture.response("bleRelayResult") + ("accepted" to JsonPrimitive(1.5)))
    assertThrows(SerializationException::class.java) { WireFixture.decode<BleRelayResult>(fractional) }
  }

  @Test
  fun `the phone watches decode with a null model and refuse a missing key`() {
    val watch = WireFixture.decode<PhoneWatches>(WireFixture.response("phoneWatches")).watches.single()
    assertNull(watch.model)
    assertEquals(32, watch.authKey.length)
    refuses<PhoneWatches>("phoneWatches", "watches", 0, "authKey")
    refuses<PhoneWatches>("phoneWatches", "watches", 0, "model")
  }

  @Test
  fun `the watch data decodes weather and user or their absence`() {
    val data = WireFixture.decode<WatchData>(WireFixture.response("watchData"))
    assertEquals("Home", data.weather?.place)
    assertNull(data.weather?.now?.uvIndex)
    assertEquals(30, data.user?.activeMinutes)
    val empty = WireFixture.decode<WatchData>(WireFixture.response("watchDataEmpty"))
    assertTrue(empty.weather == null && empty.user == null)
  }

  @Test
  fun `the watch data refuses weather or user that lack a required field`() {
    refuses<WatchData>("watchData", "weather", "now")
    refuses<WatchData>("watchData", "weather", "hours", 0, "windDirection")
    refuses<WatchData>("watchData", "user", "activeMinutes")
    refuses<WatchData>("watchData", "weather")
  }

  @Test
  fun `the saved watch records name the routes the hub could not match`() {
    val saved = WireFixture.decode<WatchRecordsSaved>(WireFixture.response("watchRecordsSaved"))
    assertEquals(listOf(Instant.parse("2026-10-17T06:00:00Z")), saved.unmatchedRoutes)
    refuses<WatchRecordsSaved>("watchRecordsSaved", "unmatchedRoutes")
  }

  @Test
  fun `an AI speech notice decodes with showText off when absent and refuses missing audio`() {
    val notice = WireFixture.decode<AiSpeechNotice>(WireFixture.response("aiSpeechNotice"))
    assertEquals("Ada", notice.from)
    assertTrue(notice.showText)
    val quiet = WireFixture.without(WireFixture.response("aiSpeechNotice"), "showText")
    assertEquals(false, WireFixture.decode<AiSpeechNotice>(quiet).showText)
    refuses<AiSpeechNotice>("aiSpeechNotice", "audio")
  }

  @Test
  fun `an AI speech push decodes its id and refuses a push without one`() {
    val push = WireFixture.decode<AiSpeechPayload>(WireFixture.response("aiSpeechPush"))
    assertEquals("7c2d9a10-4b1e-4c25-9d63-1a2b3c4d5e6f", push.id)
    refuses<AiSpeechPayload>("aiSpeechPush", "id")
  }

  @Test
  fun `a phone action push decodes through the push payload key and refuses a missing action`() {
    val push = mapOf(DomainConstants.PUSH_PAYLOAD_KEY to WireFixture.response("phoneActionPush").toString()).pushPayload<PhoneActionPayload>()
    assertEquals("3b9c1d52-7a40-4e1f-8c26-5d1e0f2a9b73", push.requestId)
    assertEquals("set_volume", (push.action.getValue("type") as JsonPrimitive).content)
    assertEquals("assistant", push.origin.source)
    assertEquals("Desk assistant", push.origin.client)
    refuses<PhoneActionPayload>("phoneActionPush", "action")
    refuses<PhoneActionPayload>("phoneActionPush", "requestId")
    refuses<PhoneActionPayload>("phoneActionPush", "origin")
  }

  @Test
  fun `a watch action push decodes its device and deadline and refuses a push without them`() {
    val push = WireFixture.decode<WatchActionPayload>(WireFixture.response("watchActionPush"))
    assertEquals("5e2b8d44-1f93-4a07-b6c1-0d7a9e3f2c58", push.deviceId)
    assertEquals(Instant.parse("2026-10-17T08:00:25Z"), push.expiresAt)
    refuses<WatchActionPayload>("watchActionPush", "deviceId")
    refuses<WatchActionPayload>("watchActionPush", "action")
    refuses<WatchActionPayload>("watchActionPush", "expiresAt")
    assertThrows(SerializationException::class.java) {
      mapOf(DomainConstants.PUSH_PAYLOAD_KEY to "{\"requestId\":\"a\",\"deviceId\":\"b\",\"action\":{},\"expiresAt\":\"soon\"}").pushPayload<WatchActionPayload>()
    }
  }

  @Test
  fun `an answer that does not match is reported as the hub refusing it`() {
    val client = HubClient(IngestTarget("https://hub.example/api/ble/", "token"))
    val failure = assertThrows(IngestRejected::class.java) {
      client.decode<BleRelayResult>(HubAnswer(200, "{}"))
    }
    assertTrue(failure.message.orEmpty().contains("HTTP 200"))
    assertThrows(IngestRejected::class.java) { client.decode<BleRelayResult>(HubAnswer(200, "not json")) }
  }

  private inline fun <reified T> refuses(name: String, vararg path: Any) {
    val broken: JsonElement = WireFixture.without(WireFixture.response(name), *path)
    assertThrows("${path.toList()} should be required", SerializationException::class.java) {
      WireFixture.decode<T>(broken)
    }
  }
}
