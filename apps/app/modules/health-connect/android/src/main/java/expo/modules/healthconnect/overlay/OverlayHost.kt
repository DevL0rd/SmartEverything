package expo.modules.healthconnect.overlay

enum class OverlayHostKind(val label: String) {
  Window("window"),
  Session("session"),
  None("none"),
}

data class OverlayHostFacts(
  val shown: Boolean,
  val locked: Boolean,
  val screenOn: Boolean,
  val canDrawOverlays: Boolean,
  val sessionShown: Boolean,
)

enum class SessionStart { OpenApp, HostOnly, StartCall }

object OverlayHostRule {
  fun hostFor(facts: OverlayHostFacts): OverlayHostKind = when {
    !facts.shown -> OverlayHostKind.None
    facts.sessionShown && sessionKeeps(facts.locked, facts.canDrawOverlays) -> OverlayHostKind.Session
    facts.locked || !facts.screenOn || !facts.canDrawOverlays -> OverlayHostKind.None
    else -> OverlayHostKind.Window
  }

  fun sessionKeeps(locked: Boolean, canDrawOverlays: Boolean): Boolean = locked || !canDrawOverlays

  fun barAvailable(enabled: Boolean, canDrawOverlays: Boolean): Boolean = enabled && canDrawOverlays

  fun pipAutoEnter(wanted: Boolean, barAvailable: Boolean): Boolean = wanted && !barAvailable

  fun sessionStart(appForeground: Boolean, callRunning: Boolean, wake: Boolean): SessionStart = when {
    appForeground -> SessionStart.OpenApp
    callRunning || wake -> SessionStart.HostOnly
    else -> SessionStart.StartCall
  }
}
