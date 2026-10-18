package expo.modules.healthconnect

import expo.modules.healthconnect.diagnostics.NativeLog
import androidx.health.connect.client.records.Record
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

object SyncEvents {
  private val flow = MutableSharedFlow<Map<String, Any>>(
    extraBufferCapacity = 64,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
  )

  val progress: SharedFlow<Map<String, Any>> = flow

  fun emit(type: RecordType, phase: SyncPhase, records: Int, deletions: Int) {
    flow.tryEmit(
      mapOf(
        "type" to type.name,
        "phase" to phase.label,
        "records" to records,
        "deletions" to deletions
      )
    )
  }
}

class Tally {
  var records = 0
    private set
  var deletions = 0
    private set
  private val touched = linkedSetOf<String>()

  val types: List<String>
    get() = touched.toList()

  fun add(type: RecordType, records: Int, deletions: Int) {
    this.records += records
    this.deletions += deletions
    if (records + deletions > 0) {
      touched.add(type.name)
    }
  }
}

class Uploader(
  private val client: IngestClient,
  private val grantedTypes: List<String>,
  private val tally: Tally,
  private val ownPackage: String,
  private val entries: EntryRecordMap
) {
  suspend fun upload(
    type: RecordType,
    phase: SyncPhase,
    records: List<Record>,
    deletions: List<String>
  ) {
    var sentRecords = 0
    var sentDeletions = 0
    val others = records.filter { it.metadata.dataOrigin.packageName != ownPackage }
    val ours = entries.claimDeleted(deletions)
    val foreign = deletions.filter { it !in ours }
    NativeLog.debug(SCOPE, "upload.planned") {
      mapOf("type" to type.name, "phase" to phase.label, "records" to records.size, "own" to (records.size - others.size), "deletions" to deletions.size, "ownDeletions" to ours.size)
    }
    for (chunk in recordChunks(others.map { RecordJson.describe(type, it) })) {
      val started = System.nanoTime()
      client.send(IngestBatch(chunk, emptyList(), grantedTypes))
      NativeLog.debug(SCOPE, "batch.sent", NativeLog.elapsedMs(started)) { mapOf("type" to type.name, "phase" to phase.label, "records" to chunk.size) }
      sentRecords += chunk.size
      tally.add(type, chunk.size, 0)
      SyncEvents.emit(type, phase, sentRecords, sentDeletions)
    }
    for (chunk in foreign.chunked(DELETIONS_PER_BATCH)) {
      val started = System.nanoTime()
      client.send(IngestBatch(emptyList(), chunk, grantedTypes))
      NativeLog.debug(SCOPE, "batch.sent", NativeLog.elapsedMs(started)) { mapOf("type" to type.name, "phase" to phase.label, "deletions" to chunk.size) }
      sentDeletions += chunk.size
      tally.add(type, 0, chunk.size)
      SyncEvents.emit(type, phase, sentRecords, sentDeletions)
    }
  }

  suspend fun acknowledge() {
    client.send(IngestBatch(emptyList(), emptyList(), grantedTypes))
  }

  private fun recordChunks(described: List<HealthEnvelope>): List<List<HealthEnvelope>> {
    val chunks = mutableListOf<List<HealthEnvelope>>()
    var current = mutableListOf<HealthEnvelope>()
    var bytes = 0
    for (record in described) {
      val size = HubJson.encode(record).length
      if (current.isNotEmpty() && (current.size == RECORDS_PER_BATCH || bytes + size > BATCH_BYTES)) {
        chunks.add(current)
        current = mutableListOf()
        bytes = 0
      }
      current.add(record)
      bytes += size
    }
    if (current.isNotEmpty()) {
      chunks.add(current)
    }
    return chunks
  }

  private companion object {
    const val SCOPE = "health-upload"
    const val RECORDS_PER_BATCH = 250
    const val DELETIONS_PER_BATCH = DomainConstants.HEALTH_BATCH_LIMIT
    const val BATCH_BYTES = 2_000_000
  }
}
