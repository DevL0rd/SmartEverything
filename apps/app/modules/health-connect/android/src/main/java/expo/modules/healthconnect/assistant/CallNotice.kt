package expo.modules.healthconnect.assistant

import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.ServiceStartRefused

data class CallNoticeState(
  val startedAt: Long,
  val muted: Boolean,
  val screen: Boolean,
  val camera: Boolean
)

class CallServiceMissing : Exception("The call service is not running, so the call cannot show the camera or screen yet")

object CallNotice {
  private var current: CallNoticeState? = null

  @Synchronized
  fun begin(context: Context) {
    current = CallNoticeState(System.currentTimeMillis(), muted = false, screen = false, camera = false)
    try {
      context.startForegroundService(Intent(context, CallService::class.java))
    } catch (failure: IllegalStateException) {
      current = null
      throw ServiceStartRefused("the call service", failure)
    }
  }

  @Synchronized
  fun update(change: (CallNoticeState) -> CallNoticeState) {
    val next = change(current ?: return)
    current = next
    CallService.running?.show(next)
  }

  @Synchronized
  fun raise(change: (CallNoticeState) -> CallNoticeState) {
    val next = change(current ?: throw CallServiceMissing())
    (CallService.running ?: throw CallServiceMissing()).show(next)
    current = next
  }

  @Synchronized
  fun state(): CallNoticeState? = current

  @Synchronized
  fun end(context: Context) {
    current = null
    context.stopService(Intent(context, CallService::class.java))
  }
}
