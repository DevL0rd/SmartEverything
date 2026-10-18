package expo.modules.healthconnect

import android.util.Log
import expo.modules.healthconnect.diagnostics.NativeLog

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
    val started = System.nanoTime()
    try {
      block()
      NativeLog.trace("native-guard", "entry.finished", NativeLog.elapsedMs(started)) { mapOf("entry" to entry) }
    } catch (failure: Exception) {
      val named = BackgroundEntryFailed(entry, failure)
      Log.e(TAG, named.message.orEmpty(), failure)
      NativeLog.error("native-guard", "entry.failed", failure) { mapOf("entry" to entry) }
      NativeFailures.emit("entry_failed", named.message.orEmpty())
    }
  }
}

object NativeFailures : NativeEventChannel()
