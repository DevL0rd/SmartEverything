package expo.modules.healthconnect.overlay

import kotlin.math.exp
import kotlin.math.pow

const val OVERLAY_LEVEL_SHAPE = 0.6
const val OVERLAY_LEVEL_FLOOR = 0.03
const val OVERLAY_LEVEL_REST = 0.01
const val OVERLAY_LEVEL_ATTACK_MS = 40.0
const val OVERLAY_LEVEL_RELEASE_MS = 180.0

val OVERLAY_LEVEL_AUDIBLE: Double = OVERLAY_LEVEL_FLOOR.pow(1.0 / OVERLAY_LEVEL_SHAPE)

private fun clamp01(value: Double): Double = if (!(value > 0.0)) 0.0 else if (value > 1.0) 1.0 else value

fun overlayLevel(previous: Double, sample: Double, dtMs: Double): Double {
  val from = clamp01(previous)
  if (!(dtMs > 0.0)) return from
  val shaped = clamp01(sample).pow(OVERLAY_LEVEL_SHAPE)
  val target = if (shaped < OVERLAY_LEVEL_FLOOR) 0.0 else shaped
  val tau = if (target > from) OVERLAY_LEVEL_ATTACK_MS else OVERLAY_LEVEL_RELEASE_MS
  val next = from + (target - from) * (1 - exp(-dtMs / tau))
  return if (next < OVERLAY_LEVEL_REST && target == 0.0) 0.0 else next
}

interface OverlayLevelSource {
  fun sample(): Double

  fun setWake(wake: Runnable?)
}

class OverlayLevelTap : OverlayLevelSource {
  @Volatile
  private var value = 0.0

  @Volatile
  private var onAudible: Runnable? = null

  override fun sample(): Double = value

  override fun setWake(wake: Runnable?) {
    onAudible = wake
  }

  fun set(level: Double) {
    val was = value
    value = level
    if (was < OVERLAY_LEVEL_AUDIBLE && level >= OVERLAY_LEVEL_AUDIBLE) onAudible?.run()
  }

  fun clear() {
    value = 0.0
  }
}

class OverlayLevelFollower {
  var level = 0.0
    private set

  fun advance(sample: Double, dtMs: Double): Double {
    level = overlayLevel(level, sample, dtMs)
    return level
  }

  fun reset() {
    level = 0.0
  }
}

class OverlayRest {
  private var quietFor = 0.0

  var silentMs = OverlayMotion.REST_SILENT_MS

  var resting = false
    private set

  fun advance(audible: Boolean, dtMs: Double): Boolean {
    if (audible) {
      quietFor = 0.0
      resting = false
      return false
    }
    quietFor += dtMs
    if (quietFor >= silentMs) resting = true
    return resting
  }

  fun wake() {
    quietFor = 0.0
    resting = false
  }
}
