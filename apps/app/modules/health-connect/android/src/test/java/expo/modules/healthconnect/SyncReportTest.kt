package expo.modules.healthconnect

import java.time.Instant
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class SyncReportTest {
  private val stored = """
    {"trigger":"scheduled","startedAt":"2026-10-17T10:00:00Z","finishedAt":"2026-10-17T10:00:05Z",
    "outcome":"retrying","records":12,"deletions":3,"types":["Steps","Weight"],"error":"offline"}
  """.trimIndent()

  @Test
  fun `a stored report reads back with its labels, instants and types`() {
    val report = HubJson.decode<SyncReport>(stored)
    assertEquals(SyncTrigger.SCHEDULED, report.trigger)
    assertEquals(SyncOutcome.RETRYING, report.outcome)
    assertEquals(Instant.parse("2026-10-17T10:00:05Z"), report.finishedAt)
    assertEquals(listOf("Steps", "Weight"), report.types)
    assertEquals("offline", report.error)
  }

  @Test
  fun `a report is stored with the same labels it showed before`() {
    val report = SyncReport(
      SyncTrigger.MANUAL, Instant.parse("2026-10-17T10:00:00Z"), Instant.parse("2026-10-17T10:00:01Z"),
      SyncOutcome.SUCCEEDED, 1, 0, listOf("Steps"), null
    )
    val text = HubJson.encode(report)
    assertEquals(report.toMap()["trigger"], HubJson.parseObject(text).text("trigger"))
    assertEquals(report.toMap()["outcome"], HubJson.parseObject(text).text("outcome"))
    assertNull(HubJson.decode<SyncReport>(text).error)
  }

  @Test
  fun `a stored report without a required field or with an unknown label is refused`() {
    assertThrows(SerializationException::class.java) { HubJson.decode<SyncReport>(stored.replace("\"records\":12,", "")) }
    assertThrows(SerializationException::class.java) { HubJson.decode<SyncReport>(stored.replace(",\"error\":\"offline\"", "")) }
    assertThrows(SerializationException::class.java) { HubJson.decode<SyncReport>(stored.replace("retrying", "paused")) }
  }
}
