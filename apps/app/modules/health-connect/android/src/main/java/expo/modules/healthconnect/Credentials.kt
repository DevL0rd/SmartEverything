package expo.modules.healthconnect

import android.content.Context

class IngestTarget(val endpoint: String, val token: String)

enum class CredentialSlot(val preferences: String, val keyAlias: String) {
  HEALTH_SOURCE("expo.modules.healthconnect.credentials", "expo.modules.healthconnect.source-token"),
  SERVER("expo.modules.healthconnect.server", "expo.modules.healthconnect.server-token")
}

class Credentials(context: Context, private val slot: CredentialSlot = CredentialSlot.HEALTH_SOURCE) {
  private val preferences = context.getSharedPreferences(slot.preferences, Context.MODE_PRIVATE)
  private val box = KeystoreBox(slot.keyAlias)

  fun save(target: IngestTarget) {
    preferences.edit()
      .putString(ENDPOINT, target.endpoint)
      .putString(TOKEN, box.seal(target.token))
      .apply()
  }

  fun configured(): Boolean =
    preferences.getString(ENDPOINT, null) != null && preferences.getString(TOKEN, null) != null

  fun load(): IngestTarget {
    val endpoint = preferences.getString(ENDPOINT, null)
    val sealed = preferences.getString(TOKEN, null)
    if (endpoint == null || sealed == null) {
      throw if (slot == CredentialSlot.SERVER) ScaleRelayNotConfigured() else SyncNotConfigured()
    }
    return IngestTarget(endpoint, box.open(sealed))
  }

  private companion object {
    const val ENDPOINT = "endpoint"
    const val TOKEN = "token"
  }
}
