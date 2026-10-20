package expo.modules.healthconnect.overlay

private class SeeWhat(val what: String, val accept: String)

private val SEE_WHAT = mapOf(
  SightSource.DesktopScreen to SeeWhat("your screen", "Share screen"),
  SightSource.PhoneScreen to SeeWhat("your screen", "Share screen"),
  SightSource.DesktopWindow to SeeWhat("a window", "Share a window"),
  SightSource.PhoneCamera to SeeWhat("your camera", "Turn camera on"),
  SightSource.HomeCamera to SeeWhat("a home camera", "Show a home camera"),
)

private const val TALKING_ONLY = "Only while the assistant is talking"
private const val CAMERA_FIRST = "Turn the camera on first"

fun overlayDuration(startedAt: Long?, endedAt: Long?): String? {
  if (startedAt == null || endedAt == null || endedAt < startedAt) return null
  val seconds = (endedAt - startedAt) / MS_PER_SECOND
  return "${seconds / SECONDS_PER_MINUTE}:${(seconds % SECONDS_PER_MINUTE).toString().padStart(2, '0')}"
}

private const val MS_PER_SECOND = 1000L
private const val SECONDS_PER_MINUTE = 60L

private fun modeOf(input: OverlayInput, call: OverlayCall): OverlayMode {
  val surface = input.surface
  if (surface is OverlaySurface.Desktop && call.sharing != null) return OverlayMode.Share
  return if (surface.main == MainWindow.Other) OverlayMode.Compact else OverlayMode.Full
}

private fun cameraOn(call: OverlayCall): Boolean =
  call.camera == CameraPhase.On || call.camera == CameraPhase.Paused || call.camera == CameraPhase.Starting

private fun phoneControls(state: OverlayState, call: OverlayCall): List<OverlayControl> {
  val reconnecting = state == OverlayState.Reconnecting
  val controls = ArrayList<OverlayControl>()
  if (!reconnecting) controls.add(OverlayControl.Mute)
  if (state == OverlayState.Speaking) controls.add(OverlayControl.Interrupt)
  if (call.sharing != null) controls.add(OverlayControl.StopShare)
  if (!reconnecting) controls.add(OverlayControl.More)
  controls.add(OverlayControl.End)
  return controls
}

private fun desktopControls(state: OverlayState, mode: OverlayMode): List<OverlayControl> {
  val speaking = if (state == OverlayState.Speaking) listOf(OverlayControl.Interrupt) else emptyList()
  val reconnecting = state == OverlayState.Reconnecting
  val middle = when (mode) {
    OverlayMode.Full -> if (reconnecting) emptyList() else listOf(OverlayControl.Camera, OverlayControl.Share)
    OverlayMode.Share -> listOf(OverlayControl.StopShare)
    OverlayMode.Compact -> emptyList()
  }
  val mute = if (reconnecting) emptyList() else listOf(OverlayControl.Mute)
  return mute + speaking + middle + OverlayControl.More + OverlayControl.End
}

private fun detailOf(call: OverlayCall): String? {
  val sharing = call.sharing
  if (sharing != null) {
    if (sharing.kind == SharingKind.Screen) return OverlayCopy.SHARING_SCREEN
    return "${OverlayCopy.SHARING_WINDOW} ${sharing.label ?: "a window"}"
  }
  return when (call.camera) {
    CameraPhase.On, CameraPhase.Starting -> OverlayCopy.CAMERA_ON
    CameraPhase.Paused -> OverlayCopy.CAMERA_PAUSED
    else -> null
  }
}

private fun tile(id: TileId, label: String, pressed: Boolean?, disabled: String?): OverlayTile =
  OverlayTile(id, label, pressed, disabled, id == TileId.StopShare)

private fun tilesOf(call: OverlayCall, state: OverlayState, captions: Boolean): List<OverlayTile> {
  val camera = call.reasons.camera
  val share = call.reasons.share
  val cameraOn = cameraOn(call)
  val sharing = call.sharing != null
  return listOf(
    tile(TileId.Camera, "Camera", cameraOn, camera),
    tile(TileId.PauseVideo, "Pause video", call.camera == CameraPhase.Paused, camera ?: if (cameraOn) null else CAMERA_FIRST),
    tile(TileId.ShowThis, "Show this", null, share),
    if (sharing) tile(TileId.StopShare, "Stop sharing", null, null) else tile(TileId.ShareScreen, "Share screen", null, share),
    tile(TileId.ShareWindow, if (sharing) "Share another" else "Share a window", null, share),
    tile(TileId.HomeCamera, "Home camera", null, share),
    tile(TileId.Interrupt, "Stop talking", null, if (state == OverlayState.Speaking) null else TALKING_ONLY),
    tile(TileId.Captions, "Captions", captions, null),
    tile(TileId.Settings, "Call settings", null, null),
  )
}

private fun phoneTilesOf(call: OverlayCall, state: OverlayState, captions: Boolean): List<OverlayTile> {
  val camera = call.reasons.camera
  val share = call.reasons.share
  val cameraOn = cameraOn(call)
  val speaker = call.speaker?.let { listOf(tile(TileId.Speaker, "Speaker", it, null)) } ?: emptyList()
  return listOf(
    tile(TileId.Camera, "Camera", cameraOn, camera),
    tile(TileId.PauseVideo, "Pause video", call.camera == CameraPhase.Paused, camera ?: if (cameraOn) null else CAMERA_FIRST),
    if (call.sharing != null) tile(TileId.StopShare, "Stop sharing", null, null) else tile(TileId.ShareScreen, "Share screen", null, share),
    tile(TileId.HomeCamera, "Home camera", null, share),
  ) + speaker + listOf(
    tile(TileId.Interrupt, "Stop talking", null, if (state == OverlayState.Speaking) null else TALKING_ONLY),
    tile(TileId.Captions, "Captions", captions, null),
    tile(TileId.Settings, "Call settings", null, null),
  )
}

private fun trayOf(input: OverlayInput, call: OverlayCall, state: OverlayState): OverlayTray =
  OverlayTray(
    assistant = call.assistant,
    chat = call.chat,
    elapsedFrom = call.startedAt,
    tiles = (if (input.surface is OverlaySurface.Phone) ::phoneTilesOf else ::tilesOf)(call, state, input.prefs.captions),
    setup = setupOf(input.voice),
    mics = input.audio.mics,
    micId = input.audio.micId,
    volume = input.audio.volume,
  )

private fun requestOf(call: OverlayCall): OverlayRequest? {
  val request = call.request ?: return null
  val see = SEE_WHAT.getValue(request.what)
  return OverlayRequest(
    title = "${call.assistant} ${OverlayCopy.WANTS_TO_SEE} ${see.what}",
    why = request.why,
    accept = see.accept,
    expiresAt = request.expiresAt,
  )
}

fun withCall(base: OverlayViewState, input: OverlayInput, call: OverlayCall): OverlayViewState {
  val phone = input.surface is OverlaySurface.Phone
  val mode = modeOf(input, call)
  val glowOn = mode == OverlayMode.Full && !(phone && call.sharing != null)
  return base.copy(
    mode = mode,
    detail = detailOf(call),
    glow = if (glowOn) base.glow else GlowMode.Off,
    controls = if (phone) phoneControls(base.state, call) else desktopControls(base.state, mode),
    speaker = call.speaker,
    camera = call.camera,
    tray = trayOf(input, call, base.state),
    chip = chipOf(input.voice),
    request = requestOf(call),
  )
}
