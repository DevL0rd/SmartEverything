package expo.modules.healthconnect.assistant

import android.content.Context
import expo.modules.healthconnect.voice.OpusEncoderPipe
import expo.modules.healthconnect.voice.OpusPlayer
import expo.modules.healthconnect.voice.SpeechGate
import expo.modules.healthconnect.voice.VoiceTones
import expo.modules.healthconnect.voice.SpeechGateSink
import expo.modules.healthconnect.voice.VoiceCapture
import expo.modules.healthconnect.voice.VoiceSocket
import expo.modules.healthconnect.voice.VoiceSocketListener
import kotlin.math.sqrt
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import org.json.JSONException
import org.json.JSONObject

sealed interface AssistantCallEvent {
  data class Message(val json: String) : AssistantCallEvent
  data class Closed(val code: Int, val reason: String) : AssistantCallEvent
}

object AssistantCallEvents {
  internal val flow = MutableSharedFlow<AssistantCallEvent>(
    extraBufferCapacity = 256,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
  )
  val events: SharedFlow<AssistantCallEvent> = flow
}

class AssistantCall(private val context: Context, serverUrl: String, token: String) : VoiceSocketListener {
  private val player = OpusPlayer(context)
  private val socket = VoiceSocket(
    serverUrl.trimEnd('/').replaceFirst("http", "ws") + PATH,
    listOf(PROTOCOL, "bearer.$token"),
    this
  )
  private var capture: AutoCloseable? = null
  private var encoder: OpusEncoderPipe? = null
  private var gate: SpeechGate? = null

  @Volatile
  private var muted = false

  @Volatile
  var inputLevel = 0.0
    private set

  fun open() = socket.open()

  fun begin(callId: String, source: String, device: String, chatId: String?, answering: String? = null) {
    val start = JSONObject().put("type", "call_start").put("callId", callId).put("source", source).put("device", device).put("gated", true)
    if (chatId != null) start.put("chatId", chatId)
    if (answering != null) start.put("answering", answering)
    send(start)
    VoiceTones.permit()
    player.begin()
    val speech = SpeechGate(context, activitySink(callId), player::audible)
    gate = speech
    val pipe = OpusEncoderPipe { packet -> speech.packet(packet) }
    encoder = pipe
    capture = VoiceCapture.addConsumer { pcm ->
      inputLevel = levelOf(pcm)
      if (!muted) {
        speech.hear(pcm)
        pipe.feed(pcm)
      }
    }
  }

  fun mute(callId: String, on: Boolean) {
    muted = on
    send(JSONObject().put("type", "mute").put("callId", callId).put("muted", on))
  }

  fun end(callId: String?) {
    if (callId != null) send(JSONObject().put("type", "call_end").put("callId", callId))
    close()
  }

  fun close() {
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
    socket.close()
  }

  override fun opened() = Unit

  override fun text(text: String) {
    if (typeOf(text) == "interrupted") {
      player.flush()
      player.begin()
    }
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Message(text))
  }

  override fun binary(bytes: ByteArray) {
    if (bytes.size > 1 && bytes[0] == AUDIO_FRAME) player.push(bytes.copyOfRange(1, bytes.size))
  }

  override fun closed(code: Int, reason: String) {
    AssistantCallEvents.flow.tryEmit(AssistantCallEvent.Closed(code, reason))
  }

  private fun activitySink(callId: String) = object : SpeechGateSink {
    override fun start() = send(JSONObject().put("type", "activity").put("callId", callId).put("speaking", true))

    override fun packet(packet: ByteArray) {
      socket.sendBinary(byteArrayOf(AUDIO_FRAME) + packet)
    }

    override fun end() = send(JSONObject().put("type", "activity").put("callId", callId).put("speaking", false))
  }

  private fun send(message: JSONObject) {
    socket.sendText(message.toString())
  }

  private fun typeOf(text: String): String? =
    try {
      JSONObject(text).optString("type")
    } catch (failure: JSONException) {
      null
    }

  private fun levelOf(pcm: ShortArray): Double {
    var sum = 0.0
    for (sample in pcm) sum += sample.toDouble() * sample.toDouble()
    return minOf(1.0, sqrt(sum / maxOf(1, pcm.size)) / 32768.0 * 4.0)
  }

  private companion object {
    const val PATH = "/assistant"
    const val PROTOCOL = "smarteverything.assistant.v1"
    const val AUDIO_FRAME: Byte = 0x01
  }
}
