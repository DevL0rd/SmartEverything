package expo.modules.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.changes.Change
import androidx.health.connect.client.changes.DeletionChange
import androidx.health.connect.client.changes.UpsertionChange
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.request.ChangesTokenRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.healthconnect.diagnostics.NativeLog
import java.time.Duration
import java.time.Instant
import kotlin.reflect.KClass
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class SyncPlan(
  val client: HealthConnectClient,
  val types: List<RecordType>,
  val historyAllowed: Boolean,
  val uploader: Uploader
)

class SyncEngine(private val context: Context) {
  private val state = SyncState(context)

  suspend fun run(trigger: SyncTrigger): SyncReport = lock.withLock {
    val startedAt = Instant.now()
    val tally = Tally()
    val clock = System.nanoTime()
    NativeLog.info(SCOPE, "run.started") { mapOf("trigger" to trigger.label) }
    val report = try {
      val plan = plan(trigger, tally)
      NativeLog.debug(SCOPE, "run.planned", NativeLog.elapsedMs(clock)) {
        mapOf("types" to plan.types.size, "history" to plan.historyAllowed)
      }
      for (type in plan.types) {
        sync(plan, type)
      }
      plan.uploader.acknowledge()
      BodyWriter.deliver(context)
      EntryWriter.deliver(context)
      reportOf(trigger, startedAt, tally, SyncOutcome.SUCCEEDED, null)
    } catch (failure: SyncFailure) {
      val outcome = if (failure.retryable) SyncOutcome.RETRYING else SyncOutcome.FAILED
      NativeLog.warn(SCOPE, "run.failed", failure, NativeLog.elapsedMs(clock)) {
        mapOf("trigger" to trigger.label, "outcome" to outcome.label, "retryable" to failure.retryable, "records" to tally.records, "deletions" to tally.deletions)
      }
      reportOf(trigger, startedAt, tally, outcome, failure.message)
    }
    NativeLog.info(SCOPE, "run.finished", NativeLog.elapsedMs(clock)) {
      mapOf("trigger" to trigger.label, "outcome" to report.outcome.label, "records" to report.records, "deletions" to report.deletions, "types" to report.types.size)
    }
    state.saveReport(report)
    report
  }

  fun lastReport(): SyncReport? = state.lastReport()

  private fun reportOf(
    trigger: SyncTrigger,
    startedAt: Instant,
    tally: Tally,
    outcome: SyncOutcome,
    error: String?
  ) = SyncReport(
    trigger,
    startedAt,
    Instant.now(),
    outcome,
    tally.records,
    tally.deletions,
    tally.types,
    error
  )

  private suspend fun plan(trigger: SyncTrigger, tally: Tally): SyncPlan {
    val client = HealthConnectAccess.client(context)
    val target = Credentials(context).load()
    val access = HealthConnectAccess.grants(client)
    if (trigger == SyncTrigger.SCHEDULED && !access.background) {
      throw BackgroundReadNotGranted()
    }
    val uploader = Uploader(
      IngestClient(context, target),
      access.types.map { it.name },
      tally,
      context.packageName,
      EntryRecordMap(context)
    )
    return SyncPlan(client, access.types, access.history, uploader)
  }

  private suspend fun sync(plan: SyncPlan, type: RecordType) {
    val cursor = state.changes(type)
    val started = System.nanoTime()
    NativeLog.debug(SCOPE, "type.started") { mapOf("type" to type.name, "mode" to if (cursor == null) "backfill" else "changes") }
    try {
      if (cursor == null) {
        backfill(plan, type)
      } else {
        changes(plan, type, cursor)
      }
      NativeLog.debug(SCOPE, "type.finished", NativeLog.elapsedMs(started)) { mapOf("type" to type.name) }
    } catch (failure: SyncFailure) {
      NativeLog.warn(SCOPE, "type.failed", failure, NativeLog.elapsedMs(started)) { mapOf("type" to type.name, "retryable" to failure.retryable) }
      throw failure
    }
  }

  private suspend fun backfill(plan: SyncPlan, type: RecordType) {
    val pending = state.pendingToken(type)
      ?: freshToken(plan.client, type).also { state.beginBackfill(type, it) }
    val now = Instant.now()
    val start = if (plan.historyAllowed) null else now.minus(DEFAULT_WINDOW)
    val end = state.backfillCursor(type)?.plusMillis(1) ?: now
    readWindow(plan.client, type, start, end) { page ->
      plan.uploader.upload(type, SyncPhase.BACKFILL, page, emptyList())
      state.advanceBackfill(type, RecordJson.startOf(page.last()))
    }
    state.acceptChanges(type, pending, now)
  }

  private suspend fun changes(plan: SyncPlan, type: RecordType, cursor: ChangesCursor) {
    var token = cursor.token
    do {
      val response = HealthConnectAccess.call { plan.client.getChanges(token) }
      if (response.changesTokenExpired) {
        NativeLog.info(SCOPE, "token.expired") { mapOf("type" to type.name, "action" to "recover", "syncedAt" to cursor.syncedAt.toString()) }
        recover(plan, type, cursor)
        return
      }
      val collapsed = collapse(response.changes)
      plan.uploader.upload(type, SyncPhase.CHANGES, collapsed.first, collapsed.second)
      state.acceptChanges(type, response.nextChangesToken, Instant.now())
      token = response.nextChangesToken
    } while (response.hasMore)
  }

  private suspend fun recover(plan: SyncPlan, type: RecordType, cursor: ChangesCursor) {
    val fresh = freshToken(plan.client, type)
    val now = Instant.now()
    readWindow(plan.client, type, cursor.syncedAt.minus(RECOVERY_OVERLAP), now) { page ->
      plan.uploader.upload(type, SyncPhase.RECOVERY, page, emptyList())
    }
    state.acceptChanges(type, fresh, now)
  }

  private fun collapse(changes: List<Change>): Pair<List<Record>, List<String>> {
    val upserted = linkedMapOf<String, Record>()
    val deleted = linkedSetOf<String>()
    for (change in changes) {
      when (change) {
        is UpsertionChange -> {
          deleted.remove(change.record.metadata.id)
          upserted[change.record.metadata.id] = change.record
        }
        is DeletionChange -> {
          upserted.remove(change.recordId)
          deleted.add(change.recordId)
        }
        else -> throw UnmappedValue("change", change)
      }
    }
    return Pair(upserted.values.toList(), deleted.toList())
  }

  private suspend fun freshToken(client: HealthConnectClient, type: RecordType): String =
    HealthConnectAccess.call { client.getChangesToken(ChangesTokenRequest(setOf(type.recordClass))) }

  private suspend fun readWindow(
    client: HealthConnectClient,
    type: RecordType,
    start: Instant?,
    end: Instant,
    consume: suspend (List<Record>) -> Unit
  ) {
    if (start != null && !start.isBefore(end)) {
      return
    }
    val filter = if (start == null) TimeRangeFilter.before(end) else TimeRangeFilter.between(start, end)
    var pageToken: String? = null
    do {
      val request = newestFirst(type.recordClass, filter, pageToken)
      val response = HealthConnectAccess.call { client.readRecords(request) }
      if (response.records.isNotEmpty()) {
        consume(response.records)
      }
      pageToken = response.pageToken
    } while (pageToken != null)
  }

  private fun <T : Record> newestFirst(
    recordClass: KClass<T>,
    filter: TimeRangeFilter,
    pageToken: String?
  ): ReadRecordsRequest<T> = ReadRecordsRequest(
    recordType = recordClass,
    timeRangeFilter = filter,
    ascendingOrder = false,
    pageSize = PAGE_SIZE,
    pageToken = pageToken
  )

  private companion object {
    private const val SCOPE = "health-sync"
    val lock = Mutex()
    val DEFAULT_WINDOW: Duration = Duration.ofDays(30)
    val RECOVERY_OVERLAP: Duration = Duration.ofDays(1)
    const val PAGE_SIZE = 250
  }
}
