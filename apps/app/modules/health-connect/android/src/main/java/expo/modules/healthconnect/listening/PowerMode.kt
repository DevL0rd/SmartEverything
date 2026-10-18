package expo.modules.healthconnect.listening

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class PowerMode {
  @SerialName("always")
  Always,

  @SerialName("screen_on")
  ScreenOn,

  @SerialName("charging")
  Charging,

  @SerialName("away_from_home")
  AwayFromHome
}

data class PowerState(val screenOn: Boolean, val charging: Boolean, val atHome: Boolean)

class ListeningPower(
  private val mode: PowerMode,
  initial: PowerState,
  private val changed: () -> Unit
) {
  private var state = initial
  private var rest = restOf(mode, initial)

  @Synchronized
  fun reason(): String? = rest

  fun screen(on: Boolean) = update { it.copy(screenOn = on) }

  fun charging(on: Boolean) = update { it.copy(charging = on) }

  fun home(at: Boolean) = update { it.copy(atHome = at) }

  private fun update(change: (PowerState) -> PowerState) {
    val flipped = synchronized(this) {
      state = change(state)
      val next = restOf(mode, state)
      (next != rest).also { rest = next }
    }
    if (flipped) {
      changed()
    }
  }

  companion object {
    const val SCREEN_OFF = "The screen is off"
    const val NOT_CHARGING = "The phone is not charging"
    const val AT_HOME = "You are at home"

    fun restOf(mode: PowerMode, state: PowerState): String? = when (mode) {
      PowerMode.Always -> null
      PowerMode.ScreenOn -> SCREEN_OFF.takeUnless { state.screenOn }
      PowerMode.Charging -> NOT_CHARGING.takeUnless { state.charging }
      PowerMode.AwayFromHome -> AT_HOME.takeIf { state.atHome }
    }
  }
}
