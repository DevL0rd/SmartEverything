package expo.modules.healthconnect.planner

object SnoozePolicy {
  fun left(limit: Int?, used: Int): Int? = limit?.let { (it - used).coerceAtLeast(0) }

  fun allowed(limit: Int?, used: Int): Boolean = left(limit, used)?.let { it > 0 } ?: true
}

enum class RingAction { SNOOZE, STOP }

object RingActions {
  fun of(challenge: RingChallenge, snoozesLeft: Int?): List<RingAction> = listOfNotNull(
    RingAction.SNOOZE.takeIf { snoozesLeft == null || snoozesLeft > 0 },
    RingAction.STOP.takeUnless { challenge.blocksStop }
  )
}

sealed class SoundSource {
  class Tone(val id: String) : SoundSource()

  class Local(val path: String, val name: String) : SoundSource()

  class Stream(val url: String, val name: String) : SoundSource()
}

class SoundPlan(val source: SoundSource, val safetyNet: String?)

object RingSoundPlan {
  fun of(sound: RingSound, cachedPath: (RingSound.File) -> String?): SoundPlan = when (sound) {
    is RingSound.Tone -> SoundPlan(SoundSource.Tone(sound.id), null)
    is RingSound.Radio -> SoundPlan(SoundSource.Stream(sound.url, sound.name), null)
    is RingSound.File -> cachedPath(sound)?.let { SoundPlan(SoundSource.Local(it, sound.name), null) }
      ?: SoundPlan(defaultTone(), "${sound.name} is not on this phone yet, so the alarm tone is ringing instead")
  }

  fun fallback(sound: RingSound, reason: String): SoundPlan =
    SoundPlan(defaultTone(), "${sound.title} could not play ($reason), so the alarm tone is ringing instead")

  private fun defaultTone(): SoundSource = SoundSource.Tone(RingSound.DEFAULT_TONE)
}
