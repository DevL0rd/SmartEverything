package expo.modules.healthconnect.watch

import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import expo.modules.healthconnect.HealthEnvelope
import expo.modules.healthconnect.jsonArrayOf
import expo.modules.healthconnect.jsonOf
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Instant

class WatchRecordBuilderTest {
  private val bed = Instant.ofEpochSecond(1792301280L)
  private val wake = Instant.ofEpochSecond(1792314780L)

  private fun at(minutes: Long): Instant = bed.plusSeconds(minutes * 60)

  private fun sleep(id: String, start: Instant, end: Instant, stages: List<SleepStage>): HealthEnvelope = HealthEnvelope(
    recordId = id,
    type = "SleepSession",
    startTime = start,
    endTime = end,
    zoneOffsetSeconds = 0,
    sourceApp = WatchRecords.SOURCE_APP,
    lastModified = wake,
    data = jsonOf(
      "title" to null,
      "notes" to null,
      "stages" to jsonArrayOf(stages) { jsonOf("startTime" to it.start.toString(), "endTime" to it.end.toString(), "stage" to it.stage) }
    )
  )

  private val overlapping = listOf(
    SleepStage(at(-1), at(19), SleepStages.LIGHT),
    SleepStage(at(19), at(59), SleepStages.DEEP),
    SleepStage(at(-1), at(29), SleepStages.LIGHT),
    SleepStage(at(29), at(260), SleepStages.REM)
  )

  @Test
  fun `overlapping stages break the Health Connect requirement the app crashed on`() {
    val raw = overlapping.map { SleepSessionRecord.Stage(it.start, it.end, it.stage) }
    val failure = assertThrows(IllegalArgumentException::class.java) {
      SleepSessionRecord(startTime = bed, startZoneOffset = null, endTime = wake, endZoneOffset = null, metadata = Metadata.manualEntry(), stages = raw)
    }
    assertEquals("Failed requirement.", failure.message)
  }

  @Test
  fun `a night with overlapping and out of window stages is repaired and written`() {
    val built = WatchRecordBuilder.build(listOf(sleep("night", bed, wake, overlapping)))
    val record = built.records.single() as SleepSessionRecord
    assertEquals(bed, record.startTime)
    assertEquals(wake, record.endTime)
    assertEquals(listOf(SleepStages.LIGHT, SleepStages.LIGHT, SleepStages.DEEP, SleepStages.REM), record.stages.map { it.stage })
    assertEquals(bed, record.stages.first().startTime)
    assertEquals(wake, record.stages.last().endTime)
    assertTrue(built.failures.isEmpty())
    assertEquals("night", built.trims.single().recordId)
  }

  @Test
  fun `a night whose own times are invalid is reported and the other records are still built`() {
    val built = WatchRecordBuilder.build(listOf(sleep("reversed", wake, bed, emptyList()), sleep("good", bed, wake, emptyList())))
    assertEquals(1, built.records.size)
    assertEquals("reversed", built.failures.single().recordId)
    assertTrue(built.failures.single().reason.contains("not before its end"))
  }
}
