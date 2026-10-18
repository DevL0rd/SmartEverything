package expo.modules.healthconnect.overlay

val OVERLAY_HIDDEN = OverlayViewState(
  state = OverlayState.Hidden,
  mode = OverlayMode.Full,
  status = "",
  detail = null,
  caption = null,
  orb = OrbState.Idle,
  level = null,
  glow = GlowMode.Off,
  controls = emptyList(),
  muted = false,
  speaker = null,
  camera = CameraPhase.Off,
  tray = null,
  request = null,
  changesAt = null,
)

private val WHITESPACE = Regex("\\s+")

private fun flat(text: String?): String? {
  if (text == null) return null
  val value = text.replace(WHITESPACE, " ").trim()
  return value.ifEmpty { null }
}

private fun view(state: OverlayState): OverlayViewState = OVERLAY_HIDDEN.copy(state = state)

private fun shown(input: OverlayInput): Boolean {
  if (!input.prefs.enabled) return false
  return when (val surface = input.surface) {
    is OverlaySurface.Phone -> !surface.foreground
    is OverlaySurface.Desktop -> {
      val screenShared = surface.inShare && input.call?.sharing?.kind == SharingKind.Screen
      surface.main != MainWindow.Call && !(screenShared && input.prefs.whileSharing == WhileSharing.Hide)
    }
  }
}

private fun errorHideAt(from: Long, input: OverlayInput): Long? {
  val hold = input.hold
  if (hold.active) return null
  val endedAt = hold.endedAt ?: return from
  return maxOf(from, endedAt + OverlayTiming.ERROR_RELEASE_MS)
}

private class ErrorCopy(val status: String, val caption: String?, val retry: OverlayControl)

private fun errorView(copy: ErrorCopy, input: OverlayInput, from: Long): OverlayViewState {
  val changesAt = errorHideAt(from, input)
  if (changesAt != null && input.now >= changesAt) return OVERLAY_HIDDEN
  return view(OverlayState.Error).copy(
    status = copy.status,
    caption = copy.caption,
    controls = listOf(copy.retry, OverlayControl.Close),
    changesAt = changesAt,
  )
}

private fun problemView(call: OverlayCall, input: OverlayInput): OverlayViewState? {
  val problem = call.problem ?: return null
  val microphone = problem.fix == ProblemFix.Microphone
  val copy = ErrorCopy(
    status = if (microphone) OverlayCopy.MICROPHONE_BLOCKED else OverlayCopy.UNREACHABLE,
    caption = flat(problem.text),
    retry = if (microphone) OverlayControl.Fix else OverlayControl.Retry,
  )
  return errorView(copy, input, problem.at + OverlayTiming.ERROR_MS)
}

private fun supersededView(input: OverlayInput): OverlayViewState? {
  val superseded = input.superseded ?: return null
  val changesAt = superseded.at + OverlayTiming.SUPERSEDED_MS
  if (input.now >= changesAt) return null
  return view(OverlayState.Superseded).copy(
    status = "${OverlayCopy.ANSWERED_BY} ${superseded.by}",
    changesAt = changesAt,
  )
}

private fun endedView(call: OverlayCall, now: Long): OverlayViewState {
  val endedAt = call.endedAt ?: return OVERLAY_HIDDEN
  val changesAt = endedAt + OverlayTiming.ENDED_MS
  if (now >= changesAt) return OVERLAY_HIDDEN
  return view(OverlayState.Ended).copy(
    status = OverlayCopy.ENDED,
    caption = overlayDuration(call.startedAt, endedAt),
    changesAt = changesAt,
  )
}

private fun listeningView(call: OverlayCall, captions: Boolean): OverlayViewState =
  view(OverlayState.Listening).copy(
    status = if (call.muted) OverlayCopy.MUTED else OverlayCopy.LISTENING,
    caption = if (captions) flat(call.heard) else null,
    orb = OrbState.Listening,
    level = if (call.muted) null else LevelSource.Input,
    glow = GlowMode.Listening,
    muted = call.muted,
  )

private fun thinkingView(call: OverlayCall, captions: Boolean): OverlayViewState =
  view(OverlayState.Thinking).copy(
    status = OverlayCopy.THINKING,
    caption = if (captions) flat(call.tool) ?: flat(call.heard) else null,
    orb = OrbState.Thinking,
    glow = GlowMode.Shimmer,
    muted = call.muted,
  )

private fun speakingView(call: OverlayCall, captions: Boolean): OverlayViewState =
  view(OverlayState.Speaking).copy(
    status = OverlayCopy.SPEAKING,
    caption = if (captions) flat(call.said) else null,
    orb = OrbState.Speaking,
    level = LevelSource.Output,
    glow = GlowMode.Speaking,
    muted = call.muted,
  )

private fun liveView(call: OverlayCall, captions: Boolean): OverlayViewState? =
  when (call.phase) {
    CallPhase.Connecting, CallPhase.Listening -> listeningView(call, captions)
    CallPhase.Thinking -> thinkingView(call, captions)
    CallPhase.Speaking -> speakingView(call, captions)
    CallPhase.Reconnecting -> view(OverlayState.Reconnecting).copy(
      status = OverlayCopy.RECONNECTING,
      muted = call.muted,
    )
    CallPhase.Idle, CallPhase.Ended -> null
  }

private fun wakeView(input: OverlayInput): OverlayViewState {
  val wake = input.wake ?: return OVERLAY_HIDDEN
  val linkBy = wake.at + OverlayTiming.WAKE_LINK_MS
  if (input.now >= linkBy) {
    val copy = ErrorCopy(OverlayCopy.UNREACHABLE, OverlayCopy.LINK_FAILED, OverlayControl.Retry)
    return errorView(copy, input, linkBy + OverlayTiming.ERROR_MS)
  }
  return view(OverlayState.Wake).copy(
    status = if (wake.muted) OverlayCopy.MUTED else OverlayCopy.LISTENING,
    caption = if (input.prefs.captions) flat(wake.words) ?: OverlayCopy.WAKE_CAPTION else null,
    orb = OrbState.Listening,
    level = if (wake.muted) null else LevelSource.Input,
    glow = GlowMode.Bloom,
    muted = wake.muted,
    controls = listOf(OverlayControl.Mute, OverlayControl.End),
    changesAt = linkBy,
  )
}

private fun stateView(input: OverlayInput): OverlayViewState {
  supersededView(input)?.let { return it }
  val call = input.call
  if (call != null) {
    problemView(call, input)?.let { return it }
    if (call.phase == CallPhase.Ended) return endedView(call, input.now)
    liveView(call, input.prefs.captions)?.let { return it }
  }
  return wakeView(input)
}

private fun compactOf(base: OverlayViewState, input: OverlayInput): OverlayViewState {
  val surface = input.surface
  val compact = surface is OverlaySurface.Desktop && surface.main == MainWindow.Other
  return if (compact) base.copy(mode = OverlayMode.Compact, glow = GlowMode.Off) else base
}

fun overlayView(input: OverlayInput): OverlayViewState {
  if (!shown(input)) return OVERLAY_HIDDEN
  val base = stateView(input)
  if (base.state == OverlayState.Hidden) return OVERLAY_HIDDEN
  val call = input.call
  if (base.live && base.state != OverlayState.Wake && call != null) return withCall(base, input, call)
  return compactOf(base, input)
}
