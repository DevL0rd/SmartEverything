package expo.modules.healthconnect.assistant

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.os.Handler
import android.os.Looper
import android.util.Log
import expo.modules.healthconnect.voice.OpusEncoderPipe
import expo.modules.healthconnect.voice.OpusPlayer
import expo.modules.healthconnect.voice.PlayerProfile
import expo.modules.healthconnect.voice.SpeechGate
import expo.modules.healthconnect.voice.SpeechGateSink
import expo.modules.healthconnect.voice.VoiceCapture
import expo.modules.healthconnect.voice.VoiceSocket
import expo.modules.healthconnect.voice.VoiceSocketListener
import expo.modules.healthconnect.voice.VoiceTones
import kotlin.math.sqrt
import org.json.JSONException
import org.json.JSONObject

class AssistantCall(private val context: Context, serverUrl: String, token: String) : VoiceSocketListener {
  private val player = OpusPlayer(context, PlayerProfile.CALL)
  private val socket = VoiceSocket(
    serverUrl.trimEnd('/').replaceFirst("http", "ws") + PATH,
    listOf(PROTOCOL, "bearer.$token"),
    this
  )
  private val devices = CallDevices(context)
  private val link = CallLink(::lapsed)
  private val main = Handler(Looper.getMainLooper())
  private var capture: AutoCloseable? = null
  private var encoder: OpusEncoderPipe? = null
  private var gate: SpeechGate? = null
  private var network: ConnectivityManager.NetworkCallback? = null
  private var deviceWatch: AutoCloseable? = null
  private var callId: String? = null
  private var closed = false
  private var entered = false

  @Volatile
  private var muted = false

  @Volatile
  private var testing = false

  val sight = CallSight(context, ::sendBinary)

  @Volatile
  var inputLevel = 0.0
    private set

  fun open() = socket.open()

  fun begin(callId: String, source: String, device: String, chatId: String?, answering: String? = null) {
    this.callId = callId
    try {
      CallNotice.begin(context)
      CallAudioMode.enter(context)
      entered = true
      val start = JSONObject().put("type", "call_start").put("callId", callId).put("source", source).put("device", device).put("gated", true)
      if (chatId != null) start.put("chatId", chatId)
      if (answering != null) start.put("answering", answering)
      send(start)
      VoiceTones.permit()
      player.begin()
      listen(callId)
      configure(CallAudioStore.latest)
      rerouted()
      watchNetwork()
      deviceWatch = devices.watch(::rerouted)
    } catch (failure: Exception) {
      close()
      throw failure
    }
  }

  fun mute(callId: String, on: Boolean) {
    muted = on
    CallNotice.update { it.copy(muted = on) }
    send(JSONObject().put("type", "mute").put("callId", callId).put("muted", on))
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

  fun close() {
    if (closed) return
    closed = true
    network?.let { context.getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
    network = null
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
  }

  override fun opened() = link.reopened()

  override fun text(text: String) {
    val message = parsed(text)
    when (message?.optString("type")) {
      "interrupted" -> {
        player.flush()
        player.begin()
      }
      "capabilities" -> link.hubResumes = message.optBoolean("resume")
      "ready" -> if (resumes(message)) return
    }
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Message(text))
  }

  override fun binary(bytes: ByteArray) {
    if (bytes.size > 1 && bytes[0] == AUDIO_FRAME) player.push(bytes.copyOfRange(1, bytes.size))
  }

  override fun closed(code: Int, reason: String) {
    if (link.lost) return
    if (callId != null && !closed && code != VoiceSocket.TOKEN_WITHDRAWN && link.canResume()) {
      link.drop()
      gate?.reset()
      AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Link(LINK_RECONNECTING))
      return
    }
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Closed(code, reason))
  }

  private fun listen(callId: String) {
    val speech = SpeechGate(context, activitySink(callId), player::audible, CallAudioStore.latest.gate())
    gate = speech
    val pipe = OpusEncoderPipe { packet -> speech.packet(packet) }
    encoder = pipe
    capture = VoiceCapture.addConsumer { pcm ->
      inputLevel = levelOf(pcm)
      if (!muted && !testing) {
        speech.hear(pcm)
        pipe.feed(pcm)
      }
    }
  }

  private fun configure(settings: CallAudioSettings) {
    gate?.configure(settings.gate())
    VoiceCapture.configure(settings.noiseSuppression, settings.autoGain)
    player.setVolume(settings.volume.toFloat())
  }

  private fun resumes(ready: JSONObject): Boolean {
    val id = callId
    if (id == null || !link.takesReady() || !ready.optBoolean("available")) return false
    send(JSONObject().put("type", "call_resume").put("callId", id))
    if (muted) send(JSONObject().put("type", "mute").put("callId", id).put("muted", true))
    link.resumed()
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Link(LINK_LIVE))
    return true
  }

  private fun lapsed() {
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Closed(LAPSED, "The connection to your home dropped."))
  }

  private fun rerouted() {
    try {
      CallAudioMode.route(context, devices, CallAudioStore.latest.input, CallAudioStore.latest.output)
    } catch (failure: CallRouteRefused) {
      Log.e(TAG, failure.message.orEmpty())
      AssistantCallEvents.control(ROUTE_FAILED)
    }
  }

  private fun watchNetwork() {
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        main.post { if (!closed) socket.reconnectNow() }
      }
    }
    context.getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(callback)
    network = callback
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

  private fun levelOf(pcm: ShortArray): Double {
    var sum = 0.0
    for (sample in pcm) sum += sample.toDouble() * sample.toDouble()
    return minOf(1.0, sqrt(sum / maxOf(1, pcm.size)) / 32768.0 * 4.0)
  }

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
  }
}
