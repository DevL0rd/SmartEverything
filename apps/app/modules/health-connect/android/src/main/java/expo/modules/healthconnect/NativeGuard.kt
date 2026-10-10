package expo.modules.healthconnect

import android.util.Log

class BackgroundEntryFailed(entry: String, cause: Throwable) : Exception(
  "The background entry $entry failed with ${cause.javaClass.simpleName}: ${cause.message}",
  cause
)

class ServiceStartRefused(service: String, cause: Throwable) : Exception(
  "Android did not let $service start now (${cause.javaClass.simpleName}: ${cause.message}); open the app and try again",
  cause
)

object NativeGuard {
  private const val TAG = "SmartEverything"

  fun run(entry: String, block: () -> Unit) {
    try {
      block()
    } catch (failure: Exception) {
      val named = BackgroundEntryFailed(entry, failure)
      Log.e(TAG, named.message.orEmpty(), failure)
      NativeFailures.emit("entry_failed", named.message.orEmpty())
    }
  }
}

object NativeFailures : NativeEventChannel()
