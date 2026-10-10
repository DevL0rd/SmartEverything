package expo.modules.healthconnect.voice

import android.os.Handler
import android.os.Looper
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

interface VoiceSocketListener {
  fun opened()
  fun text(text: String)
  fun binary(bytes: ByteArray)
  fun closed(code: Int, reason: String)
}

class VoiceSocket(
  private val url: String,
  private val protocols: List<String>,
  private val listener: VoiceSocketListener
) {
  private val handler = Handler(Looper.getMainLooper())
  private var socket: WebSocket? = null
  private var attempt = 0
  private var stopped = false

  fun open() {
    stopped = false
    connect()
  }

  fun sendText(text: String): Boolean = socket?.send(text) ?: false

  fun sendBinary(bytes: ByteArray): Boolean = socket?.send(bytes.toByteString()) ?: false

  fun reconnectNow() {
    if (!stopped && socket == null) {
      handler.removeCallbacksAndMessages(null)
      connect()
    }
  }

  fun close() {
    stopped = true
    handler.removeCallbacksAndMessages(null)
    socket?.close(NORMAL, "stopped")
    socket = null
  }

  private fun connect() {
    val request = Request.Builder()
      .url(url)
      .header("Sec-WebSocket-Protocol", protocols.joinToString(", "))
      .build()
    socket = CLIENT.newWebSocket(request, Forwarder())
  }

  private fun lost(code: Int, reason: String) {
    socket = null
    listener.closed(code, reason)
    if (stopped || code == TOKEN_WITHDRAWN) {
      return
    }
    val delay = BACKOFF_MS[minOf(attempt, BACKOFF_MS.size - 1)]
    attempt += 1
    handler.postDelayed({ if (!stopped) connect() }, delay)
  }

  private inner class Forwarder : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      attempt = 0
      listener.opened()
    }

    override fun onMessage(webSocket: WebSocket, text: String) = listener.text(text)

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) = listener.binary(bytes.toByteArray())

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      if (webSocket == socket) handler.post { lost(code, reason) }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      if (webSocket == socket) handler.post { lost(response?.code ?: FAILED, t.message ?: t.javaClass.simpleName) }
    }
  }

  companion object {
    const val TOKEN_WITHDRAWN = 4001
    private const val NORMAL = 1000
    private const val FAILED = 1006
    private val BACKOFF_MS = longArrayOf(1_000, 2_000, 4_000, 8_000, 16_000, 30_000)
    private val CLIENT = OkHttpClient.Builder()
      .pingInterval(15, TimeUnit.SECONDS)
      .readTimeout(0, TimeUnit.MILLISECONDS)
      .build()
  }
}
