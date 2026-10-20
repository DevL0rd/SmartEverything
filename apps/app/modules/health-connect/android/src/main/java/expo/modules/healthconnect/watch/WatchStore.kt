package expo.modules.healthconnect.watch

import android.content.Context
import android.content.SharedPreferences
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

  fun capturing(): Boolean = preferences.getBoolean(CAPTURE_RAW, false)

  fun setCapturing(on: Boolean) {
    preferences.edit().putBoolean(CAPTURE_RAW, on).apply()
  }

  fun skippedFiles(deviceId: String, build: Long): MutableSet<String> = SkippedFiles(preferences, deviceId, build)

  fun active(): List<WatchConfig> = watches().filter { !paused(it.deviceId) }

  fun clear() {
    preferences.edit().clear().apply()
  }

  private companion object {
    const val PREFERENCES = "expo.modules.healthconnect.watches"
    const val KEY_ALIAS = "expo.modules.healthconnect.watch-keys"
    const val WATCHES = "watches"
    const val PAUSED = "paused:"
    const val CAPTURE_RAW = "capture-raw-files"
  }
}

class SkippedFiles(
  private val preferences: SharedPreferences,
  deviceId: String,
  private val build: Long
) : AbstractMutableSet<String>() {
  private val keysName = SKIPPED + deviceId
  private val buildName = SKIPPED_BUILD + deviceId
  private val keys = load()

  override val size: Int get() = keys.size

  override fun iterator(): MutableIterator<String> = keys.iterator()

  override fun add(element: String): Boolean = keys.add(element).also { if (it) save() }

  private fun load(): MutableSet<String> {
    if (preferences.getLong(buildName, NO_BUILD) == build) {
      return preferences.getStringSet(keysName, emptySet()).orEmpty().toMutableSet()
    }
    return mutableSetOf<String>().also { save(it) }
  }

  private fun save(current: Set<String> = keys) {
    preferences.edit().putStringSet(keysName, current.toSet()).putLong(buildName, build).apply()
  }

  private companion object {
    const val SKIPPED = "skipped-2b:"
    const val SKIPPED_BUILD = "skipped-build:"
    const val NO_BUILD = -1L
  }
}
