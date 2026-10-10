package expo.modules.healthconnect.phone

import java.time.Duration
import java.time.Instant

data class ContextOutcome(
  val snapshot: PhoneContextSnapshot,
  val events: List<PhoneEvent>,
  val settleAfter: Duration?
)

object PhoneContextEngine {
  val SETTLE: Duration = Duration.ofSeconds(30)
  private const val CERTAIN = 100
  private const val NAVIGATION = 90
  private const val SENSED = 70

  fun next(current: PhoneContextSnapshot, input: ContextInput, at: Instant): ContextOutcome {
    val inputs = absorb(current, input)
    if (input is ContextInput.Place) {
      return placed(inputs, input, at)
    }
    val (candidate, confidence) = derive(inputs)
    if (candidate == inputs.state) {
      return ContextOutcome(inputs.copy(pending = null, pendingAt = null), emptyList(), null)
    }
    if (input is ContextInput.Activity) {
      return ContextOutcome(inputs.copy(pending = candidate, pendingAt = at), emptyList(), SETTLE)
    }
    return commit(inputs, candidate, confidence, at)
  }

  fun settle(current: PhoneContextSnapshot, at: Instant): ContextOutcome {
    val pending = current.pending
    val pendingAt = current.pendingAt
    if (pending == null || pendingAt == null) {
      return ContextOutcome(current, emptyList(), null)
    }
    val waited = Duration.between(pendingAt, at)
    if (waited < SETTLE) {
      return ContextOutcome(current, emptyList(), SETTLE.minus(waited))
    }
    return commit(current, pending, derive(current).second, at)
  }

  private fun absorb(current: PhoneContextSnapshot, input: ContextInput): PhoneContextSnapshot = when (input) {
    is ContextInput.Activity -> current.copy(motion = motionAfter(current.motion, input))
    is ContextInput.Car -> current.copy(car = input.connected)
    is ContextInput.Navigation -> current.copy(navigating = input.active)
    is ContextInput.Place -> current
  }

  private fun motionAfter(motion: Motion?, input: ContextInput.Activity): Motion? = when {
    input.entered -> input.motion
    motion == input.motion -> null
    else -> motion
  }

  private fun derive(snapshot: PhoneContextSnapshot): Pair<ContextState, Int> {
    val moving = snapshot.motion
    val driving = snapshot.car || moving == Motion.VEHICLE
    val wasDriving = snapshot.state == ContextState.DRIVING || snapshot.state == ContextState.NAVIGATING
    return when {
      snapshot.navigating -> ContextState.NAVIGATING to NAVIGATION
      snapshot.car -> ContextState.DRIVING to CERTAIN
      driving -> ContextState.DRIVING to SENSED
      wasDriving -> ContextState.PARKED to SENSED
      snapshot.state == ContextState.PARKED && (moving == null || moving == Motion.STILL) -> ContextState.PARKED to SENSED
      moving != null -> moving.state to SENSED
      else -> snapshot.state to snapshot.confidence
    }
  }

  private fun commit(snapshot: PhoneContextSnapshot, state: ContextState, confidence: Int, at: Instant): ContextOutcome {
    val committed = snapshot.copy(state = state, since = at, confidence = confidence, pending = null, pendingAt = null)
    val changed = PhoneEvent.contextChanged(snapshot.state, committed, at)
    val parked = if (state == ContextState.PARKED) listOf(PhoneEvent.parked(committed.place, at)) else emptyList()
    return ContextOutcome(committed, listOf(changed) + parked, null)
  }

  private fun placed(snapshot: PhoneContextSnapshot, input: ContextInput.Place, at: Instant): ContextOutcome {
    if (input.arrived) {
      return ContextOutcome(snapshot.copy(place = input.name), listOf(PhoneEvent.place("place_arrived", input.name, at)), null)
    }
    val place = if (snapshot.place == input.name) null else snapshot.place
    return ContextOutcome(snapshot.copy(place = place), listOf(PhoneEvent.place("place_left", input.name, at)), null)
  }
}
