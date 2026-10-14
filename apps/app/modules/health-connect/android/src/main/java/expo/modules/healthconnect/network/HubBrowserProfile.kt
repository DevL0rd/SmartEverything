package expo.modules.healthconnect.network

import android.content.Context
import android.content.SharedPreferences
import android.os.Looper
import android.util.Log
import android.webkit.WebStorage
import java.util.UUID

class HubBrowserProfile(context: Context, private val publicProfileId: String? = null) : AutoCloseable {
  val name = if (publicProfileId == null) PREFIX + UUID.randomUUID().toString() else "smarteverything-public-" + publicProfileId
  private val preferences = context.applicationContext.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
  private var storage: WebStorage? = null
  private var closed = false

  init {
    checkMainThread()
    prepare(preferences)
    if (publicProfileId == null) check(current.add(name)) { "The preview profile name is already owned" }
  }

  fun capture(profile: Any) {
    check(!closed && storage == null) { "The preview profile storage was already captured or retired" }
    val type = Class.forName("androidx.webkit.Profile")
    check(type.getMethod("getName").invoke(profile) == name) { "The preview storage is not owned by this profile" }
    storage = requireNotNull(WebStorage::class.java.cast(type.getMethod("getWebStorage").invoke(profile))) { "The owned preview has no web storage" }
  }

  override fun close() {
    if (closed) return
    closed = true
    if (publicProfileId != null) return
    try {
      checkMainThread()
      check(current.contains(name)) { "The retired preview profile is not owned by this process" }
      save(preferences, pending(preferences) + name)
      Log.i(TAG, "profile.retired deletion=deferred-until-next-process")
    } catch (failure: Exception) {
      report("persist-retirement", failure)
    }
    try {
      checkMainThread()
      if (!feature("DELETE_BROWSING_DATA")) {
        Log.w(TAG, "profile.data_cleanup_deferred reason=unsupported-provider")
        return
      }
      val owned = requireNotNull(storage) { "The retired preview has no captured owned storage" }
      Class.forName("androidx.webkit.WebStorageCompat").getMethod("deleteBrowsingData", WebStorage::class.java, Runnable::class.java)
        .invoke(null, owned, Runnable { Log.i(TAG, "profile.data_cleared profile-deletion=not-completed") })
    } catch (failure: Exception) {
      report("clear-retired-data", failure)
    }
  }

  private companion object {
    const val PREFIX = "smarteverything-owned-browser-"
    const val PREFERENCES = "expo.modules.healthconnect.browser-profiles"
    const val PENDING = "retired"
    const val TAG = "SmartEverythingBrowser"
    val names = Regex(PREFIX + "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    val current = mutableSetOf<String>()
    var prepared = false

    fun checkMainThread() = check(Looper.myLooper() == Looper.getMainLooper()) { "Preview profile lifecycle requires the main thread" }
    fun feature(name: String): Boolean = Class.forName("androidx.webkit.WebViewFeature").getMethod("isFeatureSupported", String::class.java).invoke(null, name) == true

    fun pending(preferences: SharedPreferences): Set<String> {
      val values = preferences.getStringSet(PENDING, emptySet())
      val result = requireNotNull(values) { "The retired preview registry has no name set" }.toSet()
      check(result.all { names.matches(it) }) { "The retired preview registry contains an invalid owned profile name" }
      return result
    }

    fun save(preferences: SharedPreferences, values: Set<String>) {
      check(values.all { names.matches(it) }) { "Only native-owned preview profile names may be persisted" }
      check(preferences.edit().putStringSet(PENDING, values).commit()) { "The retired preview registry could not be saved" }
    }

    fun prepare(preferences: SharedPreferences) {
      if (prepared) return
      prepared = true
      try {
        check(current.isEmpty()) { "Retired profile deletion requires a fresh owned-profile process boundary" }
        val values = pending(preferences)
        if (values.isEmpty()) return
        check(feature("MULTI_PROFILE")) { "Retired profile deletion is unsupported by this WebView provider" }
        val type = Class.forName("androidx.webkit.ProfileStore")
        val store = type.getMethod("getInstance").invoke(null)
        values.forEach { name -> delete(preferences, type, store, name) }
      } catch (failure: Exception) {
        report("delete-previous-process-profiles", failure)
      }
    }

    fun delete(preferences: SharedPreferences, type: Class<*>, store: Any?, name: String) {
      try {
        check(names.matches(name) && !current.contains(name)) { "The deletion target is not a retired native-owned profile" }
        val deleted = type.getMethod("deleteProfile", String::class.java).invoke(store, name)
        check(deleted == true || deleted == false) { "WebView returned an invalid profile deletion result" }
        save(preferences, pending(preferences) - name)
        Log.i(TAG, "profile.deletion_issued existed=$deleted disk-completion=asynchronous")
      } catch (failure: Exception) {
        report("delete-retired-profile", failure)
      }
    }

    fun report(stage: String, cause: Exception) {
      val failure = HubBrowserProfileCleanupFailure(stage, cause)
      Log.e(TAG, failure.message, failure)
    }
  }
}

class HubBrowserProfileCleanupFailure(val stage: String, cause: Exception) : Exception(
  "profile.cleanup_failed stage=$stage cause=${cause.javaClass.simpleName}", cause
)
