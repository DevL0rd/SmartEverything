package expo.modules.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.metadata.Metadata
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException

class EntryReport(
  val written: Int,
  val waiting: Int,
  val failed: Int,
  val missingTypes: List<String>
) {
  fun toMap(): Map<String, Any> = mapOf(
    "written" to written,
    "waiting" to waiting,
    "failed" to failed,
    "missingTypes" to missingTypes
  )
}

class EntryNotSupported(type: String) : SyncFailure(
  "Health Connect on this phone does not support $type",
  retryable = false
)

private class Delivery {
  val written = mutableListOf<Written>()
  val failed = mutableListOf<EntryFailure>()
  val missing = linkedSetOf<String>()
  var waiting = 0

  fun fail(entry: OutboxEntry, reason: String) {
    failed.add(EntryFailure(entry.id, entry.version, reason))
  }
}

object EntryWriter {
  fun writePermissionOf(type: RecordType): String = HealthPermission.getWritePermission(type.recordClass)

  fun writePermissions(types: List<String>): Set<String> =
    types.map { writePermissionOf(RecordTypes.named(it)) }.toSet()

  suspend fun grantedTypes(client: HealthConnectClient, types: List<String>): List<String> {
    val granted = HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
    return types.filter { writePermissionOf(RecordTypes.named(it)) in granted }
  }

  suspend fun deliver(context: Context): EntryReport {
    val client = HealthConnectAccess.client(context)
    val hub = HubClient(Credentials(context).load())
    val map = EntryRecordMap(context)
    val entries = hub.get<HealthOutbox>(OUTBOX_PATH).entries
    val granted = HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
    val delivery = Delivery()
    for (entry in entries) {
      deliverOne(client, map, entry, granted, delivery)
    }
    report(hub, map, delivery)
    return EntryReport(
      delivery.written.size,
      delivery.waiting,
      delivery.failed.size,
      delivery.missing.toList()
    )
  }

  private suspend fun deliverOne(
    client: HealthConnectClient,
    map: EntryRecordMap,
    entry: OutboxEntry,
    granted: Set<String>,
    delivery: Delivery
  ) {
    val blocked = entry.records.map { it.recordType }.filter { writePermissionOf(it) !in granted }
    if (blocked.isNotEmpty()) {
      delivery.missing.addAll(blocked.map { it.name })
      delivery.waiting += 1
      return
    }
    try {
      requireSupported(client, entry)
      save(client, map, entry)
      delivery.written.add(Written(entry.id, entry.version))
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (failure: SyncFailure) {
      if (failure.retryable) throw failure
      delivery.fail(entry, failure.message ?: failure.javaClass.simpleName)
    } catch (failure: IllegalArgumentException) {
      delivery.fail(entry, "Health Connect refused it: ${failure.message}")
    } catch (failure: SerializationException) {
      delivery.fail(entry, "It could not be read: ${failure.message}")
    }
  }

  private fun requireSupported(client: HealthConnectClient, entry: OutboxEntry) {
    val unsupported = entry.records.firstOrNull { record ->
      val feature = record.recordType.feature
      feature != null && !HealthConnectAccess.offers(client, feature)
    }
    if (unsupported != null) {
      throw EntryNotSupported(unsupported.type)
    }
  }

  private suspend fun report(hub: HubClient, map: EntryRecordMap, delivery: Delivery) {
    val deleted = map.pendingDeleted()
    if (delivery.written.size + delivery.failed.size + deleted.size == 0) {
      return
    }
    hub.submit(
      OUTBOX_PATH,
      OutboxAck(entries = delivery.written, failed = delivery.failed, deletedInHealthConnect = deleted.toList())
    )
    map.reported(deleted)
  }

  private suspend fun save(client: HealthConnectClient, map: EntryRecordMap, entry: OutboxEntry) {
    val upserts = entry.records.mapNotNull { outbox -> outbox.record?.let { outbox to it } }
    val records = upserts.map { (outbox, envelope) ->
      EntryRecords.of(envelope, metadataOf(outbox.clientRecordId, entry.version))
    }
    if (records.isNotEmpty()) {
      val response = HealthConnectAccess.call { client.insertRecords(records) }
      response.recordIdsList.zip(upserts).forEach { (recordId, upsert) ->
        map.remember(recordId, upsert.first.clientRecordId)
      }
    }
    for (removed in entry.records.filter { it.record == null }) {
      map.forget(removed.clientRecordId)
      HealthConnectAccess.call {
        client.deleteRecords(removed.recordType.recordClass, emptyList(), listOf(removed.clientRecordId))
      }
    }
  }

  private fun metadataOf(clientRecordId: String, version: Long): Metadata =
    Metadata.manualEntry(clientRecordId = clientRecordId, clientRecordVersion = version)

  private const val OUTBOX_PATH = "/api/health/outbox"
}
