package expo.modules.healthconnect.overlay

import org.json.JSONObject

enum class CallOwner { App, Native }

data class CallFacts(
  val callId: String,
  val owner: CallOwner,
  val phase: CallPhase = CallPhase.Idle,
  val lostFrom: CallPhase? = null,
  val muted: Boolean = false,
  val heard: String = "",
  val said: String = "",
  val tool: String? = null,
  val problem: OverlayProblem? = null,
  val startedAt: Long? = null,
  val endedAt: Long? = null,
  val camera: Boolean = false,
  val screen: Boolean = false,
  val speaker: Boolean? = null,
) {
  val over: Boolean
    get() = phase == CallPhase.Ended
}

data class CallNoticeFacts(val muted: Boolean, val camera: Boolean, val screen: Boolean, val speaker: Boolean?)

private val LIVE_PHASES = mapOf(
  "connecting" to CallPhase.Connecting,
  "listening" to CallPhase.Listening,
  "thinking" to CallPhase.Thinking,
  "speaking" to CallPhase.Speaking,
)

object CallOverlayState {
  const val ASSISTANT = "The assistant"

  fun begun(facts: CallFacts, now: Long): CallFacts =
    if (facts.phase == CallPhase.Idle) facts.copy(phase = CallPhase.Connecting, startedAt = now) else facts

  fun message(facts: CallFacts, message: JSONObject, now: Long): CallFacts {
    if (facts.over || message.optString("callId") != facts.callId) return facts
    return when (message.optString("type")) {
      "call_state" -> LIVE_PHASES[message.optString("state")]?.let { facts.copy(phase = it, lostFrom = null) } ?: facts
      "caption" -> caption(facts, message.optString("who"), message.optString("text"))
      "ended" -> ended(facts, now, detailOf(message))
      else -> facts
    }
  }

  fun link(facts: CallFacts, reconnecting: Boolean): CallFacts {
    if (facts.over || facts.phase == CallPhase.Idle) return facts
    if (reconnecting) {
      val from = if (facts.phase == CallPhase.Reconnecting) facts.lostFrom else facts.phase
      return facts.copy(phase = CallPhase.Reconnecting, lostFrom = from)
    }
    val back = facts.lostFrom ?: return facts
    return if (facts.phase == CallPhase.Reconnecting) facts.copy(phase = back, lostFrom = null) else facts
  }

  fun notice(facts: CallFacts, notice: CallNoticeFacts): CallFacts =
    facts.copy(muted = notice.muted, camera = notice.camera, screen = notice.screen, speaker = notice.speaker)

  fun failed(facts: CallFacts, now: Long, text: String, fix: ProblemFix? = null): CallFacts =
    if (facts.over) facts else ended(facts, now, null).copy(problem = OverlayProblem(text, now, fix))

  fun ended(facts: CallFacts, now: Long, detail: String?): CallFacts {
    if (facts.over) return facts
    val problem = detail?.let { OverlayProblem(it, now, null) }
    return facts.copy(phase = CallPhase.Ended, endedAt = now, problem = facts.problem ?: problem, lostFrom = null)
  }

  fun callOf(facts: CallFacts): OverlayCall? {
    if (facts.phase == CallPhase.Idle && facts.problem == null) return null
    return OverlayCall(
      phase = facts.phase,
      muted = facts.muted,
      heard = facts.heard,
      said = facts.said,
      tool = facts.tool,
      problem = facts.problem,
      startedAt = facts.startedAt,
      endedAt = facts.endedAt,
      assistant = ASSISTANT,
      chat = null,
      camera = if (facts.camera) CameraPhase.On else CameraPhase.Off,
      speaker = facts.speaker,
      sharing = if (facts.screen) OverlaySharing(SharingKind.Screen, null) else null,
      request = null,
      reasons = OverlayReasons(null, null),
    )
  }

  fun inputOf(
    facts: CallFacts?,
    wake: OverlayWake?,
    prefs: OverlayPrefsData,
    main: MainWindow,
    now: Long,
    voice: OverlayVoice? = null,
  ): OverlayInput =
    OverlayInput(
      prefs = prefs,
      surface = OverlaySurface.Phone(main),
      call = facts?.let(::callOf),
      wake = wake,
      superseded = null,
      audio = NO_AUDIO,
      hold = NO_HOLD,
      voice = voice,
      now = now,
    )

  private val NO_AUDIO = OverlayAudio(emptyList(), null, 1.0)
  private val NO_HOLD = OverlayHold(false, null)

  private fun caption(facts: CallFacts, who: String, text: String): CallFacts = when (who) {
    "person" -> facts.copy(heard = text)
    "assistant" -> facts.copy(said = text)
    "tool" -> facts.copy(tool = text)
    else -> facts
  }

  private fun detailOf(message: JSONObject): String? =
    if (message.isNull("detail")) null else message.optString("detail").ifEmpty { null }
}
