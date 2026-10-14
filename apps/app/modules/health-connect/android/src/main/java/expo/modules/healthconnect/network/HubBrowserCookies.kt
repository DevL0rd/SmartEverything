package expo.modules.healthconnect.network

import android.os.Looper
import android.webkit.CookieManager
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class HubBrowserCookies(private val profile: () -> Any) {
  private var busy = false

  suspend fun clear(checkOwner: () -> Unit) {
    check(Looper.myLooper() == Looper.getMainLooper()) { "Preview cookie clearing requires the main thread" }
    currentCoroutineContext().ensureActive()
    checkOwner()
    val expected = profile()
    val manager = requireNotNull(CookieManager::class.java.cast(Class.forName("androidx.webkit.Profile").getMethod("getCookieManager").invoke(expected))) { "The owned preview profile has no cookie manager" }
    check(!busy) { "This preview is already clearing cookies" }
    busy = true
    suspendCancellableCoroutine<Unit> { continuation ->
      try {
        currentProfile(expected, checkOwner)
        check(continuation.isActive) { "Preview cookie clearing was cancelled" }
        manager.removeAllCookies {
          busy = false
          if (!continuation.isActive) return@removeAllCookies
          try {
            currentProfile(expected, checkOwner)
            continuation.resume(Unit)
          } catch (cause: Exception) {
            continuation.resumeWithException(cause)
          }
        }
      } catch (cause: Exception) {
        busy = false
        if (continuation.isActive) continuation.resumeWithException(cause)
      }
    }
    currentCoroutineContext().ensureActive()
    currentProfile(expected, checkOwner)
  }

  private fun currentProfile(expected: Any, checkOwner: () -> Unit) {
    checkOwner()
    check(profile() === expected) { "The preview profile changed during cookie clearing" }
  }
}
