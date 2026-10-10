package expo.modules.healthconnect.assistant

import android.os.Handler
import android.os.Looper

internal class CallLink(private val onLapsed: () -> Unit) {
  private val handler = Handler(Looper.getMainLooper())
  private val lapse = Runnable {
    lost = false
    onLapsed()
  }
  private var awaitingReady = false

  @Volatile
  var hubResumes = false

  @Volatile
  var announced = false

  @Volatile
  var lost = false
    private set

  fun canResume(): Boolean = hubResumes && announced

  fun drop() {
    lost = true
    awaitingReady = false
    handler.removeCallbacks(lapse)
    handler.postDelayed(lapse, GRACE_MS)
  }

  fun reopened() {
    awaitingReady = lost
  }

  fun takesReady(): Boolean = awaitingReady

  fun resumed() {
    lost = false
    awaitingReady = false
    handler.removeCallbacks(lapse)
  }

  fun close() {
    handler.removeCallbacks(lapse)
  }

  private companion object {
    const val GRACE_MS = 20_000L
  }
}
