package expo.modules.healthconnect.planner

import expo.modules.healthconnect.NativeEventChannel

object PlannerEvents : NativeEventChannel()

class RingPlayback(val nowPlaying: String?, val safetyNet: String?) {
  fun toMap(ringKey: String, snoozesLeft: Int?): Map<String, Any?> = mapOf(
    "ringKey" to ringKey,
    "snoozesLeft" to snoozesLeft,
    "nowPlaying" to nowPlaying,
    "safetyNet" to safetyNet
  )

  companion object {
    val PENDING = RingPlayback(null, null)
  }
}
