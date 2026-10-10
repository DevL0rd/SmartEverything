package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.KeystoreBox
import expo.modules.healthconnect.jsonOf
import org.json.JSONArray
import org.json.JSONObject

class WatchConfig(
  val deviceId: String,
  val family: String,
  val name: String,
  val model: String?,
  val address: String,
  val authKey: String
) {
  fun toJson(): JSONObject = jsonOf(
    "deviceId" to deviceId,
    "family" to family,
    "name" to name,
    "model" to model,
    "address" to address,
    "authKey" to authKey
  )

  companion object {
    fun of(json: JSONObject) = WatchConfig(
      json.getString("deviceId"),
      json.getString("family"),
      json.getString("name"),
      if (json.isNull("model")) null else json.getString("model"),
      json.getString("address").uppercase(),
      json.getString("authKey").lowercase()
    )
  }
}

class WatchStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val box = KeystoreBox(KEY_ALIAS)

  fun save(watches: List<WatchConfig>) {
    val sealed = box.seal(JSONArray(watches.map { it.toJson() }).toString())
    preferences.edit().putString(WATCHES, sealed).apply()
  }

  fun watches(): List<WatchConfig> {
    val sealed = preferences.getString(WATCHES, null) ?: return emptyList()
    val array = JSONArray(box.open(sealed))
    return (0 until array.length()).map { WatchConfig.of(array.getJSONObject(it)) }
  }

  fun byAddress(address: String): WatchConfig? = watches().firstOrNull { it.address == address.uppercase() }

  fun paused(deviceId: String): Boolean = preferences.getBoolean(PAUSED + deviceId, false)

  fun setPaused(deviceId: String, paused: Boolean) {
    preferences.edit().putBoolean(PAUSED + deviceId, paused).apply()
  }

  fun skipped(deviceId: String): Set<String> = preferences.getStringSet(SKIPPED + deviceId, emptySet()).orEmpty().toSet()

  fun setSkipped(deviceId: String, keys: Set<String>) {
    preferences.edit().putStringSet(SKIPPED + deviceId, keys).apply()
  }

  fun active(): List<WatchConfig> = watches().filter { !paused(it.deviceId) }

  fun clear() {
    preferences.edit().clear().apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.watches"
    const val KEY_ALIAS = "expo.modules.healthconnect.watch-keys"
    const val WATCHES = "watches"
    const val PAUSED = "paused:"
    const val SKIPPED = "skipped-2b:"
  }
}

class SkippedFiles(context: Context, private val deviceId: String) : AbstractMutableSet<String>() {
  private val store = WatchStore(context)
  private val keys = store.skipped(deviceId).toMutableSet()

  override val size: Int get() = keys.size

  override fun iterator(): MutableIterator<String> = keys.iterator()

  override fun add(element: String): Boolean = keys.add(element).also { if (it) store.setSkipped(deviceId, keys.toSet()) }
}
