package expo.modules.healthconnect.overlay

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

@Serializable
enum class OverlayState {
  @SerialName("hidden") Hidden,
  @SerialName("wake") Wake,
  @SerialName("listening") Listening,
  @SerialName("thinking") Thinking,
  @SerialName("speaking") Speaking,
  @SerialName("reconnecting") Reconnecting,
  @SerialName("error") Error,
  @SerialName("superseded") Superseded,
  @SerialName("ended") Ended,
}

@Serializable
enum class OverlayMode {
  @SerialName("full") Full,
  @SerialName("share") Share,
  @SerialName("compact") Compact,
}

@Serializable
enum class OrbState {
  @SerialName("idle") Idle,
  @SerialName("listening") Listening,
  @SerialName("thinking") Thinking,
  @SerialName("speaking") Speaking,
}

@Serializable
enum class LevelSource {
  @SerialName("input") Input,
  @SerialName("output") Output,
}

@Serializable
enum class GlowMode {
  @SerialName("bloom") Bloom,
  @SerialName("listening") Listening,
  @SerialName("speaking") Speaking,
  @SerialName("shimmer") Shimmer,
  @SerialName("off") Off,
}

@Serializable
enum class OverlayControl {
  @SerialName("mute") Mute,
  @SerialName("speaker") Speaker,
  @SerialName("camera") Camera,
  @SerialName("share") Share,
  @SerialName("more") More,
  @SerialName("stop_share") StopShare,
  @SerialName("interrupt") Interrupt,
  @SerialName("end") End,
  @SerialName("retry") Retry,
  @SerialName("fix") Fix,
  @SerialName("close") Close,
}

@Serializable
enum class CameraPhase {
  @SerialName("off") Off,
  @SerialName("starting") Starting,
  @SerialName("on") On,
  @SerialName("paused") Paused,
  @SerialName("denied") Denied,
  @SerialName("busy") Busy,
}

@Serializable
enum class CallPhase {
  @SerialName("idle") Idle,
  @SerialName("connecting") Connecting,
  @SerialName("listening") Listening,
  @SerialName("thinking") Thinking,
  @SerialName("speaking") Speaking,
  @SerialName("reconnecting") Reconnecting,
  @SerialName("ended") Ended,
}

@Serializable
enum class SightSource {
  @SerialName("home_camera") HomeCamera,
  @SerialName("phone_camera") PhoneCamera,
  @SerialName("phone_screen") PhoneScreen,
  @SerialName("desktop_screen") DesktopScreen,
  @SerialName("desktop_window") DesktopWindow,
}

@Serializable
enum class SharingKind {
  @SerialName("screen") Screen,
  @SerialName("window") Window,
}

@Serializable
enum class MainWindow {
  @SerialName("call") Call,
  @SerialName("other") Other,
  @SerialName("away") Away,
}

@Serializable
enum class OverlayPosition {
  @SerialName("centre") Centre,
  @SerialName("left") Left,
  @SerialName("right") Right,
}

@Serializable
enum class OverlayDisplay {
  @SerialName("active") Active,
  @SerialName("primary") Primary,
  @SerialName("app") App,
}

@Serializable
enum class WhileSharing {
  @SerialName("small") Small,
  @SerialName("hide") Hide,
}

@Serializable
enum class OverlayTheme {
  @SerialName("light") Light,
  @SerialName("dark") Dark,
}

@Serializable
enum class TileId {
  @SerialName("camera") Camera,
  @SerialName("pause_video") PauseVideo,
  @SerialName("show_this") ShowThis,
  @SerialName("share_screen") ShareScreen,
  @SerialName("stop_share") StopShare,
  @SerialName("share_window") ShareWindow,
  @SerialName("home_camera") HomeCamera,
  @SerialName("interrupt") Interrupt,
  @SerialName("speaker") Speaker,
  @SerialName("captions") Captions,
  @SerialName("settings") Settings,
}

@Serializable
enum class ProblemFix {
  @SerialName("microphone") Microphone,
}

@Serializable
enum class VoiceLevel {
  @SerialName("off") Off,
  @SerialName("low") Low,
  @SerialName("medium") Medium,
  @SerialName("high") High,
}

@Serializable
enum class SetupState {
  @SerialName("loading") Loading,
  @SerialName("ready") Ready,
  @SerialName("saving") Saving,
  @SerialName("failed") Failed,
}

@Serializable
data class OverlayPrefsData(
  val enabled: Boolean = true,
  val position: OverlayPosition = OverlayPosition.Centre,
  val glow: Boolean = true,
  val captions: Boolean = true,
  val display: OverlayDisplay = OverlayDisplay.Active,
  val whileSharing: WhileSharing = WhileSharing.Small,
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("platform")
sealed interface OverlaySurface {
  val main: MainWindow

  @Serializable
  @SerialName("desktop")
  data class Desktop(override val main: MainWindow, val inShare: Boolean) : OverlaySurface

  @Serializable
  @SerialName("phone")
  data class Phone(override val main: MainWindow) : OverlaySurface
}

@Serializable
data class OverlayProblem(val text: String, val at: Long, val fix: ProblemFix?)

@Serializable
data class OverlaySharing(val kind: SharingKind, val label: String?)

@Serializable
data class OverlayRequestInput(val what: SightSource, val why: String, val expiresAt: Long?)

@Serializable
data class OverlayReasons(val camera: String?, val share: String?)

@Serializable
data class OverlayCall(
  val phase: CallPhase,
  val muted: Boolean,
  val heard: String,
  val said: String,
  val tool: String?,
  val problem: OverlayProblem?,
  val startedAt: Long?,
  val endedAt: Long?,
  val assistant: String,
  val chat: String?,
  val camera: CameraPhase,
  val speaker: Boolean?,
  val sharing: OverlaySharing?,
  val request: OverlayRequestInput?,
  val reasons: OverlayReasons,
)

@Serializable
data class OverlayWake(val at: Long, val words: String?, val muted: Boolean)

@Serializable
data class OverlaySuperseded(val by: String, val at: Long)

@Serializable
data class OverlayMic(val id: String, val label: String)

@Serializable
data class OverlayAudio(val mics: List<OverlayMic>, val micId: String?, val volume: Double)

@Serializable
data class OverlayHold(val active: Boolean, val endedAt: Long?)

@Serializable
data class OverlayVoice(
  @SerialName("thinking_level") val thinkingLevel: VoiceLevel?,
  val saving: Boolean,
  val failed: Boolean,
  val changedInCall: Boolean,
)

@Serializable
data class OverlayInput(
  val prefs: OverlayPrefsData,
  val surface: OverlaySurface,
  val call: OverlayCall?,
  val wake: OverlayWake?,
  val superseded: OverlaySuperseded?,
  val audio: OverlayAudio,
  val hold: OverlayHold,
  val voice: OverlayVoice?,
  val now: Long,
)

@Serializable
data class OverlayTile(
  val id: TileId,
  val label: String,
  val pressed: Boolean?,
  val disabled: String?,
  val critical: Boolean,
)

@Serializable
data class OverlaySetup(val level: VoiceLevel?, val state: SetupState, val note: String)

@Serializable
data class OverlayChip(val level: VoiceLevel, val label: String, val description: String, val warm: Boolean)

@Serializable
data class OverlayTray(
  val assistant: String,
  val chat: String?,
  val elapsedFrom: Long?,
  val tiles: List<OverlayTile>,
  val setup: OverlaySetup,
  val mics: List<OverlayMic>,
  val micId: String?,
  val volume: Double,
)

@Serializable
data class OverlayRequest(val title: String, val why: String, val accept: String, val expiresAt: Long?)

@Serializable
data class OverlayViewState(
  val state: OverlayState,
  val mode: OverlayMode,
  val status: String,
  val detail: String?,
  val caption: String?,
  val orb: OrbState,
  val level: LevelSource?,
  val glow: GlowMode,
  val controls: List<OverlayControl>,
  val muted: Boolean,
  val speaker: Boolean?,
  val camera: CameraPhase,
  val tray: OverlayTray?,
  val chip: OverlayChip?,
  val request: OverlayRequest?,
  val changesAt: Long?,
) {
  val live: Boolean
    get() = state in LIVE
}

private val LIVE = setOf(
  OverlayState.Wake,
  OverlayState.Listening,
  OverlayState.Thinking,
  OverlayState.Speaking,
  OverlayState.Reconnecting,
)

object OverlayCopy {
  const val LISTENING = "Listening"
  const val MUTED = "Muted"
  const val THINKING = "Thinking"
  const val SPEAKING = "Speaking"
  const val RECONNECTING = "Reconnecting to your home"
  const val UNREACHABLE = "Can't reach your home"
  const val MICROPHONE_BLOCKED = "Microphone is blocked"
  const val LINK_FAILED = "The call did not start. Try again."
  const val ENDED = "Call ended"
  const val WAKE_CAPTION = "Say what you need"
  const val ANSWERED_BY = "Answered by"
  const val SHARING_SCREEN = "sharing your screen"
  const val SHARING_WINDOW = "sharing"
  const val CAMERA_ON = "camera on"
  const val CAMERA_PAUSED = "camera paused"
  const val WANTS_TO_SEE = "wants to see"
}

object OverlayLabels {
  const val MUTE = "Mute"
  const val UNMUTE = "Unmute"
  const val SPEAKER = "Speaker"
  const val CAMERA = "Camera"
  const val STOP_SHARE = "Stop sharing"
  const val END = "End call"
  const val MORE = "More call controls"
  const val INTERRUPT = "Stop the assistant talking"
  const val RETRY = "Retry"
  const val FIX = "Fix"
  const val CLOSE = "Close"
}

object OverlayTiming {
  const val SUPERSEDED_MS = 1600L
  const val ENDED_MS = 1200L
  const val ERROR_MS = 8000L
  const val ERROR_RELEASE_MS = 3000L
  const val WAKE_LINK_MS = 15_000L
}
