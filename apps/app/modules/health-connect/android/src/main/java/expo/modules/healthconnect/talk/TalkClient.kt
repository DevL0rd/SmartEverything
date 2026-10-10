package expo.modules.healthconnect.talk

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.healthconnect.CredentialSlot
import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.voice.OpusEncoderPipe
import expo.modules.healthconnect.voice.OpusPlayer
import expo.modules.healthconnect.voice.VoiceCapture
import expo.modules.healthconnect.voice.VoiceSocket
import expo.modules.healthconnect.voice.VoiceSocketListener
import expo.modules.healthconnect.voice.VoiceTones
import java.net.URL
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONException
import org.json.JSONObject

object TalkEvents {
  internal val flow = MutableStateFlow(TalkState())
  val state: StateFlow<TalkState> = flow
}

class TalkClient(context: Context) : VoiceSocketListener {
  private val handler = Handler(Looper.getMainLooper())
  private val store = TalkStore(context)
  private val player = OpusPlayer(context)
  private val credentials = Credentials(context, CredentialSlot.SERVER)
  private var socket: VoiceSocket? = null
  private var capture: AutoCloseable? = null
  private var encoder: OpusEncoderPipe? = null
  private val early = ArrayDeque<ByteArray>()
  private var frames = 0

  @Volatile
  private var state = TalkState(talkChannel = store.talkChannel())

  fun start() {
    val target = credentials.load()
    val url = URL(URL(target.endpoint), TALK_PATH).toString().replaceFirst("http", "ws")
    socket = VoiceSocket(url, listOf(PROTOCOL, "bearer.${target.token}"), this, HEARTBEAT_SECONDS).also { it.open() }
    update { it.copy(link = "connecting", problem = null) }
  }

  fun stop() {
    stopCapture()
    socket?.close()
    socket = null
    player.release()
    update { TalkState(talkChannel = it.talkChannel) }
  }

  fun reconnect() = socket?.reconnectNow()

  fun press(channelId: String) {
    if (!canTransmit()) return
    update { it.copy(transmit = Transmit(status = "requesting", channelId = channelId)) }
    send(JSONObject().put("type", "press").put("channelId", channelId))
    startCapture()
  }

  fun listen(channelId: String, cameraId: String) {
    if (!canTransmit()) return
    update { it.copy(transmit = Transmit(status = "requesting", channelId = channelId, cameraId = cameraId)) }
    send(JSONObject().put("type", "listen").put("channelId", channelId).put("cameraId", cameraId))
  }

  fun release() {
    if (state.live != null) {
      send(JSONObject().put("type", "release"))
      closeLive()
      return
    }
    if (state.transmit.status == "idle") return
    send(JSONObject().put("type", "release"))
    stopCapture()
    update { it.copy(transmit = Transmit()) }
  }

  fun toggle() {
    if (state.transmit.status == "idle" && state.live == null) {
      store.talkChannel().takeIf { it.isNotEmpty() }?.let { press(it) }
    } else {
      release()
    }
  }

  fun nextChannel() {
    val channels = store.channels()
    if (channels.isEmpty()) return
    val index = channels.indexOfFirst { it.id == store.talkChannel() }
    val next = channels[(index + 1) % channels.size].id
    store.setTalkChannel(next)
    update { it.copy(talkChannel = next) }
  }

  fun channelsChanged() = update { it.copy(talkChannel = store.talkChannel()) }

  override fun opened() = Unit

  override fun text(text: String) {
    handler.post {
      try {
        TalkProtocol.handle(this, JSONObject(text))
      } catch (failure: JSONException) {
        update { it.copy(problem = "The server sent a talk message this app cannot read") }
      }
    }
  }

  override fun binary(bytes: ByteArray) {
    if (bytes.size > 1 && bytes[0] == AUDIO_FRAME && (state.receive != null || state.live != null)) {
      player.push(bytes.copyOfRange(1, bytes.size))
    }
  }

  override fun closed(code: Int, reason: String) {
    stopCapture()
    player.end()
    val problem = if (code == VoiceSocket.TOKEN_WITHDRAWN) "This phone was removed from your home" else "Can’t reach your server"
    update { it.copy(link = "offline", problem = problem, transmit = Transmit(), receive = null, live = null) }
  }

  internal fun ready() = update { it.copy(link = "ready", problem = null) }

  internal fun granted(channelId: String, messageId: String, limitSeconds: Int) {
    val transmit = state.transmit
    if (transmit.status != "requesting" || transmit.channelId != channelId) {
      send(JSONObject().put("type", "release"))
      return
    }
    update { it.copy(transmit = transmit.copy(status = "talking", messageId = messageId, startedAt = System.currentTimeMillis(), limitSeconds = limitSeconds)) }
    VoiceTones.permit()
    synchronized(early) {
      early.forEach { sendAudio(it) }
      early.clear()
    }
  }

  internal fun denied(channelId: String, reason: String) {
    stopCapture()
    update { it.copy(transmit = Transmit(), denial = channelId to reason) }
    VoiceTones.busy()
  }

  internal fun ended(messageId: String, reason: String) {
    if (state.transmit.messageId != messageId) return
    stopCapture()
    update { it.copy(transmit = Transmit(), ending = reason) }
    VoiceTones.end()
  }

  internal fun rxStart(receive: Receive) {
    player.begin()
    update { it.copy(receive = receive) }
  }

  internal fun rxEnd(messageId: String) {
    if (state.receive?.messageId != messageId) return
    player.end()
    VoiceTones.roger()
    update { it.copy(receive = null) }
  }

  internal fun liveStart(live: LiveTalk) {
    update { it.copy(live = live) }
    player.begin()
    if (state.transmit.status == "idle") startCapture()
  }

  internal fun liveEnd(conversationId: String) {
    if (state.live?.conversationId == conversationId) closeLive()
  }

  private fun closeLive() {
    if (state.transmit.status == "idle") stopCapture()
    player.end()
    update { it.copy(live = null) }
  }

  private fun canTransmit(): Boolean =
    state.link == "ready" && state.transmit.status == "idle" && state.live == null

  private fun send(message: JSONObject) {
    socket?.sendText(message.toString())
  }

  private fun sendAudio(packet: ByteArray) {
    socket?.sendBinary(byteArrayOf(AUDIO_FRAME) + packet)
  }

  private fun packet(packet: ByteArray) {
    if (state.transmit.status == "talking" || state.live != null) {
      sendAudio(packet)
      return
    }
    synchronized(early) {
      if (early.size < EARLY_KEPT) early.addLast(packet)
    }
  }

  private fun startCapture() {
    try {
      val pipe = OpusEncoderPipe { packet(it) }
      encoder = pipe
      capture = VoiceCapture.addConsumer { pcm ->
        pipe.feed(pcm)
        frames += 1
        if (frames % LEVEL_EVERY == 0) {
          val level = TalkLevel.of(pcm)
          handler.post { update { it.copy(level = level) } }
        }
      }
    } catch (failure: Exception) {
      update { it.copy(problem = failure.message) }
      release()
    }
  }

  private fun stopCapture() {
    capture?.close()
    capture = null
    encoder?.close()
    encoder = null
    synchronized(early) { early.clear() }
    if (state.level != 0.0) update { it.copy(level = 0.0) }
  }

  private fun update(change: (TalkState) -> TalkState) {
    state = change(state)
    TalkEvents.flow.value = state
  }

  private companion object {
    const val TALK_PATH = "/talk"
    const val HEARTBEAT_SECONDS = 60L
    const val PROTOCOL = "smarteverything.talk.v1"
    const val AUDIO_FRAME: Byte = 1
    const val EARLY_KEPT = 50
    const val LEVEL_EVERY = 4
  }
}
