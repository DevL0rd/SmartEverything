package expo.modules.healthconnect

import androidx.health.connect.client.records.Record
import io.mockk.clearAllMocks
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.slot
import io.mockk.unmockkAll
import kotlinx.coroutines.runBlocking
import java.time.Instant
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class UploaderTest {
  private val client = mockk<IngestClient>()
  private val entries = mockk<EntryRecordMap>()
  private val tally = Tally()
  private val sent = mutableListOf<IngestBatch>()
  private val steps = RecordTypes.named("Steps")

  @Before
  fun setUp() {
    mockkObject(RecordJson)
    every { RecordJson.describe(any(), any()) } answers { envelope(secondArg<Record>().metadata.id) }
    coEvery { client.send(capture(sent)) } returns Unit
    every { entries.claimDeleted(any()) } returns emptySet()
  }

  @After
  fun tearDown() {
    unmockkAll()
    clearAllMocks()
  }

  @Test
  fun `records from other apps are sent in batches of at most 250 with the granted types`() = runBlocking {
    uploader().upload(steps, SyncPhase.BACKFILL, records(600), emptyList())
    assertEquals(listOf(250, 250, 100), sent.map { it.records.size })
    assertTrue(sent.all { it.grantedTypes == listOf("Steps", "Weight") && it.deletions.isEmpty() })
    assertEquals(600, tally.records)
  }

  @Test
  fun `records written by this app are not uploaded back`() = runBlocking {
    val own = records(3, packageName = OWN_PACKAGE) + records(2, firstId = 10)
    uploader().upload(steps, SyncPhase.CHANGES, own, emptyList())
    assertEquals(listOf("r10", "r11"), sent.single().records.map { it.recordId })
  }

  @Test
  fun `a batch closes before it would pass two megabytes`() = runBlocking {
    every { RecordJson.describe(any(), any()) } returns envelope("big", JsonObject(mapOf("blob" to JsonPrimitive("x".repeat(900_000)))))
    uploader().upload(steps, SyncPhase.BACKFILL, records(5), emptyList())
    assertEquals(listOf(2, 2, 1), sent.map { it.records.size })
  }

  @Test
  fun `deletions go in batches of 500 and the app's own entries are claimed instead of sent`() = runBlocking {
    val ids = (1..1_100).map { "d$it" }
    every { entries.claimDeleted(ids) } returns setOf("d1", "d2")
    uploader().upload(steps, SyncPhase.CHANGES, emptyList(), ids)
    assertEquals(listOf(500, 500, 98), sent.map { it.deletions.size })
    assertTrue(sent.none { "d1" in it.deletions || "d2" in it.deletions })
    assertEquals(1_098, tally.deletions)
  }

  @Test
  fun `nothing is sent and nothing is counted for an empty upload`() = runBlocking {
    uploader().upload(steps, SyncPhase.CHANGES, emptyList(), emptyList())
    coVerify(exactly = 0) { client.send(any()) }
    assertTrue(tally.types.isEmpty())
  }

  @Test
  fun `the tally names each type that sent something once`() = runBlocking {
    val uploader = uploader()
    uploader.upload(steps, SyncPhase.CHANGES, records(1), emptyList())
    uploader.upload(steps, SyncPhase.CHANGES, records(1, firstId = 5), emptyList())
    uploader.upload(RecordTypes.named("Weight"), SyncPhase.CHANGES, emptyList(), emptyList())
    assertEquals(listOf("Steps"), tally.types)
  }

  @Test
  fun `acknowledge sends one empty batch`() = runBlocking {
    uploader().acknowledge()
    val batch = sent.single()
    assertTrue(batch.records.isEmpty() && batch.deletions.isEmpty())
    assertEquals(listOf("Steps", "Weight"), batch.grantedTypes)
  }

  @Test
  fun `a failed send stops the upload and leaves the earlier batches counted`() {
    val failure = IngestUnavailable("offline")
    val calls = slot<IngestBatch>()
    var count = 0
    coEvery { client.send(capture(calls)) } answers { if (++count == 2) throw failure }
    val thrown = runCatching { runBlocking { uploader().upload(steps, SyncPhase.BACKFILL, records(600), emptyList()) } }.exceptionOrNull()
    assertEquals(failure, thrown)
    assertEquals(250, tally.records)
  }

  private fun envelope(id: String, data: JsonObject = JsonObject(emptyMap())) = HealthEnvelope(
    id, "Steps", Instant.parse("2026-10-17T10:00:00Z"), Instant.parse("2026-10-17T10:05:00Z"), 0, "com.other",
    Instant.parse("2026-10-17T10:06:00Z"), data
  )

  private fun uploader() = Uploader(client, listOf("Steps", "Weight"), tally, OWN_PACKAGE, entries)

  private fun records(count: Int, packageName: String = "com.other", firstId: Int = 0): List<Record> = (0 until count).map { index ->
    mockk<Record> { every { metadata.id } returns "r${firstId + index}"; every { metadata.dataOrigin.packageName } returns packageName }
  }

  private companion object {
    const val OWN_PACKAGE = "com.smarteverything"
  }
}
