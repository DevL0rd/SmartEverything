package expo.modules.healthconnect.overlay

import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

object OverlaySpring {
  fun position(elapsedMs: Double, damping: Double, stiffness: Double): Double {
    if (elapsedMs <= 0.0) return 0.0
    val t = elapsedMs / MS_PER_SECOND
    val omega = sqrt(stiffness)
    val zeta = damping / (2.0 * omega)
    if (zeta >= 1.0) return 1.0 - exp(-omega * t) * (1.0 + omega * t)
    val decay = zeta * omega
    val damped = omega * sqrt(1.0 - zeta * zeta)
    return 1.0 - exp(-decay * t) * (cos(damped * t) + decay / damped * sin(damped * t))
  }

  private const val MS_PER_SECOND = 1000.0
}

enum class PresencePhase { Hidden, Entering, Shown, Exiting }

class OverlayPresence(private val reduced: Boolean) {
  var phase = PresencePhase.Hidden
    private set
  private var elapsed = 0.0
  private var exitFrom = 1f

  var alpha = 0f
    private set
  var rise = 0f
    private set
  var scale = 1f
    private set

  fun show() {
    if (phase == PresencePhase.Entering || phase == PresencePhase.Shown) return
    phase = PresencePhase.Entering
    elapsed = 0.0
    apply()
  }

  fun hide() {
    if (phase == PresencePhase.Hidden || phase == PresencePhase.Exiting) return
    exitFrom = alpha
    phase = PresencePhase.Exiting
    elapsed = 0.0
  }

  fun animating(): Boolean = phase == PresencePhase.Entering || phase == PresencePhase.Exiting

  fun advance(dtMs: Double) {
    if (!animating()) return
    elapsed += minOf(dtMs, OverlayMotion.MAX_STEP_MS)
    when (phase) {
      PresencePhase.Entering -> enter()
      PresencePhase.Exiting -> exit()
      else -> Unit
    }
  }

  private fun enter() {
    val duration = if (reduced) OverlayMotion.REDUCED_FADE_MS else OverlayMotion.ENTER_MS
    if (elapsed >= duration) {
      phase = PresencePhase.Shown
    }
    apply()
  }

  private fun exit() {
    val duration = if (reduced) OverlayMotion.REDUCED_FADE_MS else OverlayMotion.EXIT_MS
    val t = (elapsed / duration).toFloat().coerceIn(0f, 1f)
    val eased = t * t
    alpha = exitFrom * (1f - t)
    rise = if (reduced) 0f else eased * OverlayMotion.EXIT_FALL_DP
    scale = if (reduced) 1f else 1f - (1f - OverlayMotion.EXIT_SCALE_TO) * eased
    if (t >= 1f) {
      phase = PresencePhase.Hidden
      alpha = 0f
    }
  }

  private fun apply() {
    if (phase == PresencePhase.Shown) {
      alpha = 1f
      rise = 0f
      scale = 1f
      return
    }
    if (reduced) {
      alpha = (elapsed / OverlayMotion.REDUCED_FADE_MS).toFloat().coerceIn(0f, 1f)
      rise = 0f
      scale = 1f
      return
    }
    val p = OverlaySpring.position(elapsed, OverlayMotion.ENTER_DAMPING, OverlayMotion.ENTER_STIFFNESS).toFloat()
    alpha = (elapsed / ENTER_FADE_MS).toFloat().coerceIn(0f, 1f)
    rise = OverlayMotion.ENTER_RISE_DP * (1f - p)
    scale = OverlayMotion.ENTER_SCALE_FROM + (1f - OverlayMotion.ENTER_SCALE_FROM) * p
  }

  companion object {
    private const val ENTER_FADE_MS = 160.0
  }
}
