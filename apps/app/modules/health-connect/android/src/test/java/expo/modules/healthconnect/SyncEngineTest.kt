package expo.modules.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.Change
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.response.ChangesResponse
import androidx.health.connect.client.response.ReadRecordsResponse
import io.mockk.Runs
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkObject
import io.mockk.unmockkAll
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class SyncEngineTest {
  private val stores = mutableMapOf<String, MemoryPreferences>()
  private val context = mockk<Context>()
  private val client = mockk<HealthConnectClient>()
  private val steps = RecordTypes.named("Steps")
  private val uploads = mutableListOf<Upload>()
  private val readRequests = mutableListOf<ReadRecordsRequest<StepsRecord>>()

  private class Upload(val phase: SyncPhase, val records: List<Record>, val deletions: List<String>)

  @Before
  fun setUp() {
    every { context.getSharedPreferences(any(), any()) } answers { stores.getOrPut(firstArg()) { MemoryPreferences() } }
    every { context.applicationContext } returns context
    every { context.packageName } returns "com.smarteverything"
    mockkObject(HealthConnectAccess, BodyWriter, EntryWriter, RecordJson)
    every { HealthConnectAccess.client(context) } returns client
    coEvery { HealthConnectAccess.grants(client) } returns access(background = true, history = true)
    coEvery { BodyWriter.deliver(any()) } returns mockk(relaxed = true)
    coEvery { EntryWriter.deliver(any()) } returns mockk(relaxed = true)
    every { RecordJson.startOf(any()) } answers { Instant.parse(firstArg<Record>().metadata.id) }
    mockkConstructor(Credentials::class, Uploader::class)
    every { anyConstructed<Credentials>().load() } returns IngestTarget("https://hub.test/", "token")
    coEvery { anyConstructed<Uploader>().upload(any(), any(), any(), any()) } answers {
      uploads.add(Upload(secondArg(), thirdArg(), arg(3)))
    }
    coEvery { anyConstructed<Uploader>().acknowledge() } just Runs
    coEvery { client.readRecords(capture(readRequests)) } returns page(emptyList(), null)
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `the first run backfills newest first page by page and stores the token taken before reading`() {
    coEvery { client.getChangesToken(any()) } returns "token-0"
    coEvery { client.readRecords(capture(readRequests)) } returnsMany listOf(
      page(listOf(record("2026-01-03T00:00:00Z"), record("2026-01-02T00:00:00Z")), "next"),
      page(listOf(record("2026-01-01T00:00:00Z")), null)
    )
    val report = run(SyncTrigger.MANUAL)
    assertEquals(SyncOutcome.SUCCEEDED, report.outcome)
    assertEquals(listOf(SyncPhase.BACKFILL, SyncPhase.BACKFILL), uploads.map { it.phase })
    assertEquals(listOf(2, 1), uploads.map { it.records.size })
    assertEquals(listOf(null, "next"), readRequests.map { it.pageToken })
    assertTrue(readRequests.none { it.ascendingOrder })
    assertEquals("token-0", SyncState(context).changes(steps)?.token)
    assertNull(SyncState(context).pendingToken(steps))
    assertNull(SyncState(context).backfillCursor(steps))
  }

  @Test
  fun `a backfill that was interrupted resumes before its cursor and keeps its token`() {
    val state = SyncState(context)
    state.beginBackfill(steps, "token-pending")
    state.advanceBackfill(steps, Instant.parse("2026-01-02T00:00:00Z"))
    run(SyncTrigger.MANUAL)
    coVerify(exactly = 0) { client.getChangesToken(any()) }
    assertEquals(Instant.parse("2026-01-02T00:00:00.001Z"), readRequests.single().timeRangeFilter.endTime)
    assertEquals("token-pending", SyncState(context).changes(steps)?.token)
  }

  @Test
  fun `without the history permission the backfill reads only the last thirty days`() {
    coEvery { HealthConnectAccess.grants(client) } returns access(background = true, history = false)
    coEvery { client.getChangesToken(any()) } returns "token-0"
    run(SyncTrigger.MANUAL)
    val filter = readRequests.single().timeRangeFilter
    val window = Duration.between(filter.startTime, filter.endTime)
    assertEquals(Duration.ofDays(30), window)
  }

  @Test
  fun `with the history permission the backfill has no start`() {
    coEvery { client.getChangesToken(any()) } returns "token-0"
    run(SyncTrigger.MANUAL)
    assertNull(readRequests.single().timeRangeFilter.startTime)
  }

  @Test
  fun `a later run follows the change token until there are no more pages`() {
    SyncState(context).acceptChanges(steps, "token-1", Instant.now())
    coEvery { client.getChanges("token-1") } returns changes(listOf(upsert("a")), "token-2", more = true)
    coEvery { client.getChanges("token-2") } returns changes(listOf(deleted("b")), "token-3", more = false)
    run(SyncTrigger.MANUAL)
    assertEquals(listOf(SyncPhase.CHANGES, SyncPhase.CHANGES), uploads.map { it.phase })
    assertEquals(listOf("a"), uploads[0].records.map { it.metadata.id })
    assertEquals(listOf("b"), uploads[1].deletions)
    assertEquals("token-3", SyncState(context).changes(steps)?.token)
  }

  @Test
  fun `within one page the last change for a record wins`() {
    SyncState(context).acceptChanges(steps, "token-1", Instant.now())
    val page = listOf(upsert("a"), deleted("a"), deleted("b"), upsert("b"), upsert("c"))
    coEvery { client.getChanges("token-1") } returns changes(page, "token-2", more = false)
    run(SyncTrigger.MANUAL)
    assertEquals(listOf("b", "c"), uploads.single().records.map { it.metadata.id })
    assertEquals(listOf("a"), uploads.single().deletions)
  }

  @Test
  fun `an expired token is replaced by a fresh one and the last day plus the gap is re-read`() {
    val syncedAt = Instant.now().minus(Duration.ofDays(3))
    SyncState(context).acceptChanges(steps, "token-old", syncedAt)
    coEvery { client.getChanges("token-old") } returns mockk { every { changesTokenExpired } returns true }
    coEvery { client.getChangesToken(any()) } returns "token-fresh"
    coEvery { client.readRecords(capture(readRequests)) } returns page(listOf(record("2026-01-01T00:00:00Z")), null)
    run(SyncTrigger.MANUAL)
    assertEquals(listOf(SyncPhase.RECOVERY), uploads.map { it.phase })
    assertEquals(syncedAt.minus(Duration.ofDays(1)), readRequests.single().timeRangeFilter.startTime)
    assertEquals("token-fresh", SyncState(context).changes(steps)?.token)
  }

  @Test
  fun `a scheduled run without background access fails without retry and is remembered`() {
    coEvery { HealthConnectAccess.grants(client) } returns access(background = false, history = true)
    val report = run(SyncTrigger.SCHEDULED)
    assertEquals(SyncOutcome.FAILED, report.outcome)
    assertTrue(report.error.orEmpty().contains("READ_HEALTH_DATA_IN_BACKGROUND"))
    assertEquals(SyncOutcome.FAILED, SyncEngine(context).lastReport()?.outcome)
    assertTrue(uploads.isEmpty())
  }

  @Test
  fun `a retryable failure is reported as retrying with its message`() {
    SyncState(context).acceptChanges(steps, "token-1", Instant.now())
    coEvery { client.getChanges("token-1") } throws IngestUnavailable("offline")
    val report = run(SyncTrigger.MANUAL)
    assertEquals(SyncOutcome.RETRYING, report.outcome)
    assertTrue(report.error.orEmpty().contains("offline"))
  }

  @Test
  fun `a successful run totals what was uploaded and acknowledges the hub once`() {
    SyncState(context).acceptChanges(steps, "token-1", Instant.now())
    coEvery { client.getChanges("token-1") } returns changes(listOf(upsert("a")), "token-2", more = false)
    val report = run(SyncTrigger.MANUAL)
    assertEquals(SyncOutcome.SUCCEEDED, report.outcome)
    assertNotNull(SyncEngine(context).lastReport())
    coVerify(exactly = 1) { anyConstructed<Uploader>().acknowledge() }
    coVerify(exactly = 1) { BodyWriter.deliver(context) }
    coVerify(exactly = 1) { EntryWriter.deliver(context) }
  }

  private fun run(trigger: SyncTrigger): SyncReport = runBlocking { SyncEngine(context).run(trigger) }

  private fun access(background: Boolean, history: Boolean) = Access(listOf(steps), emptyList(), background, history)

  private fun record(id: String): StepsRecord = mockk { every { metadata.id } returns id }

  private fun upsert(id: String): UpsertionChange = mockk { every { record } returns record(id) }

  private fun deleted(id: String): DeletionChange = mockk { every { recordId } returns id }

  private fun page(records: List<StepsRecord>, token: String?): ReadRecordsResponse<StepsRecord> = mockk {
    every { this@mockk.records } returns records
    every { pageToken } returns token
  }

  private fun changes(list: List<Change>, next: String, more: Boolean): ChangesResponse = mockk {
    every { changes } returns list
    every { nextChangesToken } returns next
    every { hasMore } returns more
    every { changesTokenExpired } returns false
  }
}
