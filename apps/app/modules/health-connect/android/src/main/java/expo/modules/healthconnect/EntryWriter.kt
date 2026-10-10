package expo.modules.healthconnect

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.metadata.Metadata
import kotlinx.coroutines.CancellationException
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

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

class OutboxRecord(json: JSONObject) {
  val type: RecordType = RecordTypes.named(json.getString("type"))
  val clientRecordId: String = json.getString("clientRecordId")
  val record: JSONObject? = if (json.isNull("record")) null else json.getJSONObject("record")
}

class OutboxEntry(json: JSONObject) {
  val id: String = json.getString("id")
  val version: Long = json.getLong("version")
  val records: List<OutboxRecord> = json.getJSONArray("records").let { list ->
    (0 until list.length()).map { OutboxRecord(list.getJSONObject(it)) }
  }
}

class EntryNotSupported(type: String) : SyncFailure(
  "Health Connect on this phone does not support $type",
  retryable = false
)

private class Delivery {
  val written = JSONArray()
  val failed = JSONArray()
  val missing = linkedSetOf<String>()
  var waiting = 0

  fun fail(entry: OutboxEntry, reason: String) {
    failed.put(jsonOf("id" to entry.id, "version" to entry.version, "reason" to reason.take(500)))
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
    val list = hub.get(OUTBOX_PATH).getJSONArray("entries")
    val entries = (0 until list.length()).map { OutboxEntry(list.getJSONObject(it)) }
    val granted = HealthConnectAccess.call { client.permissionController.getGrantedPermissions() }
    val delivery = Delivery()
    for (entry in entries) {
      deliverOne(client, map, entry, granted, delivery)
    }
    report(hub, map, delivery)
    return EntryReport(
      delivery.written.length(),
      delivery.waiting,
      delivery.failed.length(),
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
    val blocked = entry.records.map { it.type }.filter { writePermissionOf(it) !in granted }
    if (blocked.isNotEmpty()) {
      delivery.missing.addAll(blocked.map { it.name })
      delivery.waiting += 1
      return
    }
    try {
      requireSupported(client, entry)
      save(client, map, entry)
      delivery.written.put(jsonOf("id" to entry.id, "version" to entry.version))
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (failure: SyncFailure) {
      if (failure.retryable) throw failure
      delivery.fail(entry, failure.message ?: failure.javaClass.simpleName)
    } catch (failure: IllegalArgumentException) {
      delivery.fail(entry, "Health Connect refused it: ${failure.message}")
    } catch (failure: JSONException) {
      delivery.fail(entry, "It could not be read: ${failure.message}")
    }
  }

  private fun requireSupported(client: HealthConnectClient, entry: OutboxEntry) {
    val unsupported = entry.records.firstOrNull { record ->
      val feature = record.type.feature
      feature != null && !HealthConnectAccess.offers(client, feature)
    }
    if (unsupported != null) {
      throw EntryNotSupported(unsupported.type.name)
    }
  }

  private suspend fun report(hub: HubClient, map: EntryRecordMap, delivery: Delivery) {
    val deleted = map.pendingDeleted()
    if (delivery.written.length() + delivery.failed.length() + deleted.size == 0) {
      return
    }
    hub.post(
      OUTBOX_PATH,
      jsonOf(
        "entries" to delivery.written,
        "failed" to delivery.failed,
        "deletedInHealthConnect" to JSONArray(deleted.toList())
      )
    )
    map.reported(deleted)
  }

  private suspend fun save(client: HealthConnectClient, map: EntryRecordMap, entry: OutboxEntry) {
    val upserts = entry.records.mapNotNull { outbox -> outbox.record?.let { outbox to it } }
    val records = upserts.map { (outbox, json) ->
      EntryRecords.of(json, metadataOf(outbox.clientRecordId, entry.version))
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
        client.deleteRecords(removed.type.recordClass, emptyList(), listOf(removed.clientRecordId))
      }
    }
  }

  private fun metadataOf(clientRecordId: String, version: Long): Metadata =
    Metadata.manualEntry(clientRecordId = clientRecordId, clientRecordVersion = version)

  private const val OUTBOX_PATH = "outbox"
}
