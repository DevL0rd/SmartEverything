package expo.modules.healthconnect

import android.content.Context

class EntryRecordMap(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun remember(recordId: String, clientRecordId: String) {
    preferences.edit()
      .putString(RECORD_PREFIX + recordId, clientRecordId)
      .putString(CLIENT_PREFIX + clientRecordId, recordId)
      .apply()
  }

  fun forget(clientRecordId: String) {
    val recordId = preferences.getString(CLIENT_PREFIX + clientRecordId, null)
    val edit = preferences.edit().remove(CLIENT_PREFIX + clientRecordId)
    if (recordId != null) {
      edit.remove(RECORD_PREFIX + recordId)
    }
    edit.apply()
  }

  fun claimDeleted(recordIds: List<String>): Set<String> {
    val claimed = recordIds.filter { preferences.contains(RECORD_PREFIX + it) }.toSet()
    if (claimed.isEmpty()) {
      return claimed
    }
    val clientIds = claimed.mapNotNull { preferences.getString(RECORD_PREFIX + it, null) }
    val edit = preferences.edit()
    for (recordId in claimed) {
      edit.remove(RECORD_PREFIX + recordId)
    }
    for (clientRecordId in clientIds) {
      edit.remove(CLIENT_PREFIX + clientRecordId)
    }
    edit.putStringSet(PENDING, pendingDeleted() + clientIds).apply()
    return claimed
  }

  fun pendingDeleted(): Set<String> = preferences.getStringSet(PENDING, emptySet()).orEmpty().toSet()

  fun reported(clientRecordIds: Set<String>) {
    preferences.edit().putStringSet(PENDING, pendingDeleted() - clientRecordIds).apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.entries"
    const val RECORD_PREFIX = "record:"
    const val CLIENT_PREFIX = "client:"
    const val PENDING = "pending-deleted"
  }
}
