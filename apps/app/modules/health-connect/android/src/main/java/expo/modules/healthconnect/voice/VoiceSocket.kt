package expo.modules.healthconnect.voice

import android.os.Handler
import android.os.Looper
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.NativeCredentialWithdrawn
import expo.modules.healthconnect.network.HubLease
import expo.modules.healthconnect.network.HubRouteBinding
import expo.modules.healthconnect.network.HubRoutePolicy
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import expo.modules.healthconnect.network.HubTransport
import expo.modules.healthconnect.network.HubBoundedSocket
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
  private val listener: VoiceSocketListener,
  pingSeconds: Long = DEFAULT_PING_SECONDS,
  private val target: IngestTarget? = null
) {
  private val heartbeat = pingSeconds
  private val handler = Handler(Looper.getMainLooper())
  private var socket: WebSocket? = null
  private var scopeId: String? = null
  private var attempt = 0
  private var stopped = false
  private var opening = false
  private var epoch = 0L
  private var activeLease: HubLease? = null
  private var binding: HubRouteBinding? = null
  private var authority: HubRoutePolicy? = null
  private var routes: AutoCloseable? = null
  private val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  fun open() {
    stopped = false
    connect()
  }

  fun sendText(text: String): Boolean = current() && socket?.send(text) == true

  fun sendBinary(bytes: ByteArray): Boolean = current() && socket?.send(bytes.toByteString()) == true

  fun reconnectNow() {
    if (!stopped && socket == null) {
      handler.removeCallbacksAndMessages(null)
      connect()
    }
  }

  fun close() {
    stopped = true
    epoch += 1
    opening = false
    routes?.close()
    routes = null
    handler.removeCallbacksAndMessages(null)
    socket?.let { HubTransport.releaseSocket(scopeId, it); it.close(NORMAL, "stopped") }
    socket = null
  }

  private fun connect() {
    if (stopped || opening || socket != null) return
    opening = true
    val run = ++epoch
    io.launch {
      try {
        val bound = target?.binding?.invoke()
        val policy = target?.policy?.invoke()
        val lease = if (bound == null) HubTransport.lease(url) else policy?.lease(bound, url)
          ?: error("Voice requires its native route authority")
        handler.post { if (!stopped && epoch == run) attach(lease, bound, policy) }
      } catch (failure: Exception) {
        handler.post { if (!stopped && epoch == run) {
          opening = false
          lost(if (failure is NativeCredentialWithdrawn) TOKEN_WITHDRAWN else FAILED, "Hub transport trust is unavailable")
        } }
      }
    }
  }

  private fun attach(lease: HubLease, bound: HubRouteBinding?, policy: HubRoutePolicy?) {
    opening = false
    activeLease = lease
    binding = bound
    authority = policy
    scopeId = lease.scopeId
    if (routes == null && policy != null && bound != null) routes = policy.subscribe { state -> handler.post {
      if (stopped || state["scopeId"] != bound.scopeId) return@post
      if (!policy.bound(bound)) { lost(TOKEN_WITHDRAWN, "Hub credential was withdrawn"); return@post }
      if (state["routeGeneration"] != activeLease?.routeGeneration && socket != null) {
        val retired = socket
        socket = null
        retired?.let { HubTransport.releaseSocket(scopeId, it); it.cancel() }
        listener.closed(1001, "Hub route changed")
      }
      if (state["readiness"] == "ready" && socket == null) reconnectNow()
    } }
    val request = Request.Builder().url(lease.url)
      .header("Sec-WebSocket-Protocol", protocols.joinToString(", ")).build()
    val next = HubBoundedSocket(lease, request, Forwarder(), heartbeat)
    socket = next
    HubTransport.trackSocket(scopeId, next)
    next.start()
  }

  private fun current(): Boolean = try { activeLease?.check(); !stopped && socket != null }
    catch (failure: java.io.IOException) { false }

  private fun lost(code: Int, reason: String) {
    socket = null
    listener.closed(code, reason)
    if (code == TOKEN_WITHDRAWN) { stopped = true; routes?.close(); routes = null }
    if (stopped) return
    val delay = BACKOFF_MS[minOf(attempt, BACKOFF_MS.size - 1)]
    attempt += 1
    handler.postDelayed({ if (!stopped) connect() }, delay)
  }

  private inner class Forwarder : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      if (webSocket != socket || !current()) return
      attempt = 0
      listener.opened()
    }

    override fun onMessage(webSocket: WebSocket, text: String) { if (webSocket == socket && current()) listener.text(text) }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) { if (webSocket == socket && current()) listener.binary(bytes.toByteArray()) }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      HubTransport.releaseSocket(scopeId, webSocket)
      if (webSocket == socket) handler.post { if (webSocket == socket) lost(code, reason) }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      HubTransport.releaseSocket(scopeId, webSocket)
      if (webSocket == socket) handler.post { if (webSocket == socket) {
        binding?.let { authority?.failed(it, activeLease?.routeGeneration) }
        lost(response?.code ?: FAILED, t.message ?: t.javaClass.simpleName)
      } }
    }
  }

  companion object {
    const val TOKEN_WITHDRAWN = 4001
    private const val NORMAL = 1000
    private const val FAILED = 1006
    private val BACKOFF_MS = longArrayOf(1_000, 2_000, 4_000, 8_000, 16_000, 30_000)
    const val DEFAULT_PING_SECONDS = 15L
  }
}
