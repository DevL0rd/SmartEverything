package expo.modules.healthconnect.assistant

import expo.modules.healthconnect.diagnostics.NativeLog
import android.content.Context
import android.util.Log
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.listening.ReplayThenLive
import expo.modules.healthconnect.overlay.CallFacts
import expo.modules.healthconnect.overlay.CallOverlayState
import expo.modules.healthconnect.overlay.CallOwner
import expo.modules.healthconnect.overlay.OverlayStage
import expo.modules.healthconnect.voice.OpusEncoderPipe
import expo.modules.healthconnect.voice.OpusPlayer
import expo.modules.healthconnect.voice.PcmLevel
import expo.modules.healthconnect.voice.PlayerProfile
import expo.modules.healthconnect.voice.SpeechGate
import expo.modules.healthconnect.voice.SpeechGateSink
import expo.modules.healthconnect.voice.VoiceCapture
import expo.modules.healthconnect.voice.VoiceSocket
import expo.modules.healthconnect.voice.VoiceSocketListener
import expo.modules.healthconnect.voice.VoiceTones
import org.json.JSONException
import org.json.JSONObject

class NativeStart(val callId: String, val source: String, val device: String)

class AssistantCall(
  private val context: Context,
  serverUrl: String,
  token: String,
  target: IngestTarget,
  owner: CallOwner,
  private val released: (AssistantCall) -> Unit
) : VoiceSocketListener {
  private val player = OpusPlayer(context, PlayerProfile.CALL) { level ->
    outputLevel = level
    OverlayStage.levels.output.set(level)
  }
  private val socket = VoiceSocket(
    serverUrl.trimEnd('/').replaceFirst("http", "ws") + PATH,
    listOf(PROTOCOL, "bearer.$token"),
    this, target = target
  )
  private val devices = CallDevices(context)
  private val link = CallLink(::lapsed)
  private val replay = CallReplay(System.currentTimeMillis())
  private var capture: AutoCloseable? = null
  private var encoder: OpusEncoderPipe? = null
  private var gate: SpeechGate? = null
  private var deviceWatch: AutoCloseable? = null
  private var callId: String? = null
  private var closed = false
  private var entered = false

  @Volatile
  private var muted = false

  @Volatile
  private var testing = false

  @Volatile
  private var interruptible = false

  @Volatile
  var pending: NativeStart? = null

  @Volatile
  var owner = owner
    private set

  val sight = CallSight(context, ::sendBinary)

  @Volatile
  var inputLevel = 0.0
    private set

  @Volatile
  var outputLevel = 0.0
    private set

  fun open() = socket.open()

  fun begin(callId: String, source: String, device: String, chatId: String?, answering: String? = null) {
    this.callId = callId
    try {
      CallNotice.begin(context)
      CallAudioMode.enter(context)
      entered = true
      facts { CallOverlayState.begun(it ?: CallFacts(callId, owner), System.currentTimeMillis()) }
      val start = JSONObject().put("type", "call_start").put("callId", callId).put("source", source).put("device", device).put("gated", true)
      if (chatId != null) start.put("chatId", chatId)
      if (answering != null) start.put("answering", answering)
      send(start)
      VoiceTones.permit()
      player.begin()
      listen(callId)
      configure(CallAudioStore.latest)
      rerouted()
      deviceWatch = devices.watch(::rerouted)
    } catch (failure: Exception) {
      close()
      throw failure
    }
  }

  fun attach(): JSONObject? {
    val id = callId ?: pending?.callId ?: return null
    owner = CallOwner.App
    return replay.snapshot(id, muted)
  }

  fun mute(callId: String, on: Boolean) {
    muted = on
    CallNotice.update { it.copy(muted = on) }
    send(JSONObject().put("type", "mute").put("callId", callId).put("muted", on))
  }

  fun toggleMute() {
    callId?.let { mute(it, !muted) }
  }

  fun toggleSpeaker() {
    val settings = CallAudioStore.latest
    settings.output = if (settings.output == CallAudioMode.SPEAKER) CallAudioMode.AUTO else CallAudioMode.SPEAKER
    rerouted()
  }

  fun interrupt() {
    val id = callId ?: return
    if (interruptible) send(JSONObject().put("type", "interrupt").put("callId", id))
  }

  fun apply(settings: CallAudioSettings) {
    if (callId == null) return
    configure(settings)
    CallAudioMode.route(context, devices, settings.input, settings.output)
  }

  fun hold(on: Boolean) {
    testing = on
    gate?.reset()
  }

  fun sendJson(json: String): Boolean {
    if (typeOf(json) == SIGHT_SETTINGS) link.announced = true
    return socket.sendText(json)
  }

  fun sendBinary(bytes: ByteArray): Boolean = socket.sendBinary(bytes)

  fun end(callId: String?) {
    if (callId != null) send(JSONObject().put("type", "call_end").put("callId", callId))
    close()
  }

  fun endCall() = end(callId)

  fun close() {
    if (closed) return
    closed = true
    NativeLog.info("assistant-call", "call.closing") { mapOf("hasCall" to (callId != null), "entered" to entered) }
    deviceWatch?.close()
    deviceWatch = null
    link.close()
    sight.close()
    capture?.close()
    capture = null
    encoder?.close()
    encoder = null
    gate?.close()
    gate = null
    inputLevel = 0.0
    player.flush()
    player.release()
    VoiceTones.end()
    VoiceCapture.configure(noiseSuppression = true, autoGain = true)
    if (entered) CallAudioMode.leave(context)
    CallNotice.end(context)
    socket.close()
    facts { current -> current?.let { CallOverlayState.ended(it, System.currentTimeMillis(), null) } }
    released(this)
  }

  override fun opened() {
    NativeLog.info("assistant-call", "socket.opened") { mapOf("hasCall" to (callId != null)) }
    link.reopened()
  }

  override fun text(text: String) {
    val message = parsed(text)
    when (message?.optString("type")) {
      "interrupted" -> {
        player.flush()
        player.begin()
      }
      "capabilities" -> {
        link.hubResumes = message.optBoolean("resume")
        interruptible = message.optBoolean("interrupt")
      }
      "ready" -> if (resumes(message) || startsNative(message)) return
    }
    if (message != null) observe(message, text)
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Message(text))
  }

  override fun binary(bytes: ByteArray) {
    if (bytes.size > 1 && bytes[0] == AUDIO_FRAME) player.push(bytes.copyOfRange(1, bytes.size))
  }

  override fun closed(code: Int, reason: String) {
    NativeLog.info("assistant-call", "socket.closed") { mapOf("closeCode" to code, "reasonLength" to reason.length, "lost" to link.lost, "resumable" to (callId != null && !closed && link.canResume())) }
    if (link.lost) return
    if (callId != null && !closed && code != VoiceSocket.TOKEN_WITHDRAWN && link.canResume()) {
      link.drop()
      gate?.reset()
      facts { current -> current?.let { CallOverlayState.link(it, reconnecting = true) } }
      AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Link(LINK_RECONNECTING))
      return
    }
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Closed(code, reason))
    failed(reason.ifEmpty { DROPPED })
  }

  private fun observe(message: JSONObject, text: String) {
    replay.keep(message, text)
    val id = callId ?: return
    OverlayStage.message(id, message)
    if (owner == CallOwner.Native && message.optString("type") == "ended" && message.optString("callId") == id) close()
  }

  private fun startsNative(ready: JSONObject): Boolean {
    val start = pending ?: return false
    pending = null
    if (!ready.optBoolean("available")) {
      failed(ready.optString("reason").ifEmpty { UNAVAILABLE }, start.callId)
      return true
    }
    try {
      begin(start.callId, start.source, start.device, null)
    } catch (failure: Exception) {
      NativeLog.warn("assistant-call", "call.native_begin_failed", failure)
      failed(failure.message ?: UNAVAILABLE, start.callId)
    }
    return true
  }

  private fun failed(problem: String, id: String? = callId) {
    if (closed || id == null) return
    facts(id) { CallOverlayState.failed(it ?: CallFacts(id, owner), System.currentTimeMillis(), problem) }
    if (owner == CallOwner.Native) close()
  }

  private fun facts(id: String? = callId ?: pending?.callId, change: (CallFacts?) -> CallFacts?) {
    if (id == null) return
    OverlayStage.call { current ->
      val mine = current?.takeIf { it.callId == id }
      when {
        mine != null -> change(mine)
        current == null || current.over -> change(null) ?: current
        else -> current
      }
    }
  }

  private fun listen(callId: String) {
    val speech = SpeechGate(context, activitySink(callId), player::audible, CallAudioStore.latest.gate())
    gate = speech
    val pipe = OpusEncoderPipe { packet -> speech.packet(packet) }
    encoder = pipe
    val earlier = ReplayThenLive(sink = { pcm ->
      speech.hear(pcm)
      pipe.feed(pcm)
    })
    capture = VoiceCapture.addConsumer { pcm ->
      inputLevel = PcmLevel.of(pcm)
      OverlayStage.levels.input.set(inputLevel)
      if (!muted && !testing) earlier.live(pcm)
    }
    earlier.replay()
  }

  private fun configure(settings: CallAudioSettings) {
    gate?.configure(settings.gate())
    VoiceCapture.configure(settings.noiseSuppression, settings.autoGain)
    player.setVolume(settings.volume.toFloat())
  }

  private fun resumes(ready: JSONObject): Boolean {
    val id = callId
    if (id == null || !link.takesReady() || !ready.optBoolean("available")) return false
    NativeLog.info("assistant-call", "call.resume") { mapOf("muted" to muted) }
    send(JSONObject().put("type", "call_resume").put("callId", id))
    if (muted) send(JSONObject().put("type", "mute").put("callId", id).put("muted", true))
    link.resumed()
    facts { current -> current?.let { CallOverlayState.link(it, reconnecting = false) } }
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Link(LINK_LIVE))
    return true
  }

  private fun lapsed() {
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Closed(LAPSED, DROPPED))
    failed(DROPPED)
  }

  private fun rerouted() {
    try {
      CallAudioMode.route(context, devices, CallAudioStore.latest.input, CallAudioStore.latest.output)
    } catch (failure: CallRouteRefused) {
      Log.e(TAG, failure.message.orEmpty())
      NativeLog.warn("assistant-call", "route.refused", failure)
      AssistantCallEvents.control(ROUTE_FAILED)
    }
    CallNotice.update { it.copy(speaker = CallAudioMode.speakerOf(devices, CallAudioStore.latest.output)) }
  }

  private fun activitySink(callId: String) = object : SpeechGateSink {
    override fun start() {
      sendLive(JSONObject().put("type", "activity").put("callId", callId).put("speaking", true))
      AssistantCallEvents.control(SPEECH_STARTED)
    }

    override fun packet(packet: ByteArray) {
      if (!link.lost && !testing) socket.sendBinary(byteArrayOf(AUDIO_FRAME) + packet)
    }

    override fun end() {
      sendLive(JSONObject().put("type", "activity").put("callId", callId).put("speaking", false))
      AssistantCallEvents.control(SPEECH_ENDED)
    }
  }

  private fun sendLive(message: JSONObject) {
    if (!link.lost && !testing) send(message)
  }

  private fun send(message: JSONObject) {
    socket.sendText(message.toString())
  }

  private fun parsed(text: String): JSONObject? =
    try {
      JSONObject(text)
    } catch (failure: JSONException) {
      null
    }

  private fun typeOf(text: String): String? = parsed(text)?.optString("type")

  companion object {
    const val LINK_RECONNECTING = "reconnecting"
    const val LINK_LIVE = "live"
    const val ROUTE_FAILED = "route_failed"
    private const val SPEECH_STARTED = "speech_started"
    private const val SPEECH_ENDED = "speech_ended"
    private const val PATH = "/assistant"
    private const val PROTOCOL = "smarteverything.assistant.v1"
    private const val SIGHT_SETTINGS = "sight_settings"
    private const val AUDIO_FRAME: Byte = 0x01
    private const val LAPSED = 1006
    private const val TAG = "SmartEverythingCalls"
    private const val DROPPED = "The connection to your home dropped."
    private const val UNAVAILABLE = "The assistant is not available right now."
  }
}
