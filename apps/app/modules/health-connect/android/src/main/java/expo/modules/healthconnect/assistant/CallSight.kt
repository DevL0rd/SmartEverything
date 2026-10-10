package expo.modules.healthconnect.assistant

import android.content.Context
import android.content.Intent
import android.util.Log
import java.io.File

class CallSight(private val context: Context, private val send: (ByteArray) -> Boolean) : AutoCloseable {
  private var screen: ScreenCapture? = null
  private var screenSampling: FrameSampling? = null
  private val cameraFilter = FrameFilter()

  val screenOn: Boolean
    get() = screen != null

  fun startScreen(resultCode: Int, data: Intent, sampling: FrameSampling) {
    stopScreen()
    val projection = (CallService.running ?: throw CallServiceMissing()).projection(resultCode, data)
    screenSampling = sampling
    screen = ScreenCapture(
      context,
      projection,
      sampling,
      { jpeg -> send(SightFrames.wrap(sampling.sourceCode, false, jpeg)) },
      { AssistantCallEvents.control(SCREEN_ENDED) },
      { failure ->
        Log.e(TAG, "Screen capture failed: ${failure.message}")
        AssistantCallEvents.control(SCREEN_FAILED)
      }
    )
  }

  fun setScreenLive(live: Boolean) {
    screen?.setLive(live)
  }

  fun screenStill(done: (Boolean) -> Unit) {
    val capture = screen
    val sampling = screenSampling
    if (capture == null || sampling == null) {
      done(false)
      return
    }
    capture.still(STILL_TIMEOUT_MS) { jpeg -> done(jpeg != null && send(SightFrames.wrap(sampling.sourceCode, true, jpeg))) }
  }

  fun stopScreen() {
    screen?.close()
    screen = null
    screenSampling = null
    CallNotice.update { it.copy(screen = false) }
  }

  fun cameraOn(on: Boolean) {
    cameraFilter.reset()
    CallNotice.raise { it.copy(camera = on) }
  }

  fun cameraFrame(path: String, sampling: FrameSampling, still: Boolean): Boolean {
    try {
      val bitmap = SightFrames.decode(path, sampling.longEdge)
      try {
        if (!still && !cameraFilter.admits(bitmap, CAMERA_REFRESH_MS)) return false
        return send(SightFrames.wrap(sampling.sourceCode, still, SightFrames.encode(bitmap, sampling.quality, sampling.maxBytes)))
      } finally {
        bitmap.recycle()
      }
    } finally {
      File(path).delete()
    }
  }

  override fun close() {
    screen?.close()
    screen = null
    screenSampling = null
  }

  companion object {
    const val SCREEN_ENDED = "screen_ended"
    const val SCREEN_FAILED = "screen_failed"
    private const val TAG = "SmartEverythingCalls"
    private const val STILL_TIMEOUT_MS = 4_000L
    private const val CAMERA_REFRESH_MS = 5_000L
  }
}
