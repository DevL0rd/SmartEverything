package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.KeystoreBox
import expo.modules.healthconnect.HubJson
import kotlinx.serialization.Serializable

@Serializable
class WatchConfig(
  val deviceId: String,
  val family: String,
  val name: String,
  val model: String?,
  val address: String,
  val authKey: String
)

@Serializable
class PhoneWatches(val watches: List<WatchConfig>)

class WatchStore(context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private val box = KeystoreBox(KEY_ALIAS)

  fun save(watches: List<WatchConfig>) {
    val sealed = box.seal(HubJson.encode(watches))
    preferences.edit().putString(WATCHES, sealed).apply()
  }

  fun watches(): List<WatchConfig> {
    val sealed = preferences.getString(WATCHES, null) ?: return emptyList()
    return HubJson.decode(box.open(sealed))
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
