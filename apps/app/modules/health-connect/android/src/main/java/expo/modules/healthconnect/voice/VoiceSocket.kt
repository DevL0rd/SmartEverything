package expo.modules.healthconnect.voice

import android.os.Handler
import android.os.Looper
import expo.modules.healthconnect.IngestTarget
import expo.modules.healthconnect.NativeCredentialWithdrawn
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.network.HubLease
import expo.modules.healthconnect.network.HubRouteBinding
import expo.modules.healthconnect.network.HubRoutePolicy
import expo.modules.healthconnect.network.HubRouteReadiness
import expo.modules.healthconnect.network.HubRouteSnapshot
import expo.modules.healthconnect.network.HubTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

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
  private val id = NEXT_ID.incrementAndGet()
  private val textIn = AtomicLong()
  private val binaryIn = AtomicLong()
  private val bytesIn = AtomicLong()
  private val textOut = AtomicLong()
  private val binaryOut = AtomicLong()
  private val bytesOut = AtomicLong()
  private val dropped = AtomicLong()
  private val summaryAt = AtomicLong(System.currentTimeMillis())
  @Volatile private var openedAt = 0L

  private fun traffic() {
    val now = System.currentTimeMillis()
    val started = summaryAt.get()
    if (now - started < SUMMARY_MS || !summaryAt.compareAndSet(started, now)) return
    val total = textIn.get() + binaryIn.get() + textOut.get() + binaryOut.get()
    if (total == 0L && dropped.get() == 0L) return
    NativeLog.debug(SCOPE, "traffic.summary") {
      mapOf(
        "socket" to id,
        "textIn" to textIn.getAndSet(0),
        "binaryIn" to binaryIn.getAndSet(0),
        "bytesIn" to bytesIn.getAndSet(0),
        "textOut" to textOut.getAndSet(0),
        "binaryOut" to binaryOut.getAndSet(0),
        "bytesOut" to bytesOut.getAndSet(0),
        "droppedSends" to dropped.getAndSet(0),
        "windowMs" to now - started,
      )
    }
  }

  fun open() {
    stopped = false
    NativeLog.info(SCOPE, "socket.open_requested") { mapOf("socket" to id, "protocols" to protocols.size, "bound" to (target?.binding != null), "heartbeatSeconds" to heartbeat) }
    connect()
  }

  fun sendText(text: String): Boolean {
    val sent = current() && socket?.send(text) == true
    if (sent) { textOut.incrementAndGet(); bytesOut.addAndGet(text.length.toLong()) } else dropped.incrementAndGet()
    traffic()
    return sent
  }

  fun sendBinary(bytes: ByteArray): Boolean {
    val sent = current() && socket?.send(bytes.toByteString()) == true
    if (sent) { binaryOut.incrementAndGet(); bytesOut.addAndGet(bytes.size.toLong()) } else dropped.incrementAndGet()
    traffic()
    return sent
  }

  fun reconnectNow() {
    if (!stopped && socket == null) {
      NativeLog.info(SCOPE, "socket.reconnect_now") { mapOf("socket" to id, "attempt" to attempt, "opening" to opening) }
      handler.removeCallbacksAndMessages(null)
      connect()
    }
  }

  fun close() {
    NativeLog.info(SCOPE, "socket.close_requested") { mapOf("socket" to id, "closedBy" to "local", "hadSocket" to (socket != null), "openMs" to if (openedAt == 0L) null else System.currentTimeMillis() - openedAt) }
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
    if (stopped || opening || socket != null) {
      NativeLog.debug(SCOPE, "socket.connect_skipped") { mapOf("socket" to id, "stopped" to stopped, "opening" to opening, "hasSocket" to (socket != null)) }
      return
    }
    opening = true
    val run = ++epoch
    val started = System.nanoTime()
    io.launch {
      try {
        val bound = target?.binding?.invoke()
        val policy = target?.policy?.invoke()
        val lease = if (bound == null) HubTransport.lease(url) else policy?.lease(bound, url)
          ?: error("Voice requires its native route authority")
        NativeLog.debug(SCOPE, "lease.acquired", NativeLog.elapsedMs(started)) {
          mapOf("socket" to id, "epoch" to run, "scope" to lease.scopeId?.let(NativeLog::scopeLabel), "bound" to (bound != null), "host" to NativeLog.hostOnly(lease.url))
        }
        handler.post { if (!stopped && epoch == run) attach(lease, bound, policy) }
      } catch (failure: Exception) {
        NativeLog.warn(SCOPE, "lease.failed", failure, NativeLog.elapsedMs(started)) {
          mapOf("socket" to id, "epoch" to run, "attempt" to attempt, "withdrawn" to (failure is NativeCredentialWithdrawn))
        }
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
    if (routes == null && policy != null && bound != null) {
      routes = policy.subscribe { state -> handler.post { routed(state, bound, policy) } }
    }
    val request = Request.Builder().url(lease.url)
      .header("Sec-WebSocket-Protocol", protocols.joinToString(", ")).build()
    val next = lease.client.newBuilder().pingInterval(heartbeat, TimeUnit.SECONDS).build().newWebSocket(request, Forwarder())
    NativeLog.info(SCOPE, "socket.connecting") {
      mapOf("socket" to id, "epoch" to epoch, "attempt" to attempt, "host" to NativeLog.hostOnly(lease.url), "scope" to scopeId?.let(NativeLog::scopeLabel), "pinned" to (scopeId != null))
    }
    socket = next
    HubTransport.trackSocket(scopeId, next)
  }

  private fun routed(state: HubRouteSnapshot, bound: HubRouteBinding, policy: HubRoutePolicy) {
    if (stopped || state.scopeId != bound.scopeId) return
    NativeLog.debug(SCOPE, "route.observed") { mapOf("socket" to id, "readiness" to state.readiness.wire, "generation" to state.routeGeneration, "hasSocket" to (socket != null)) }
    if (!policy.bound(bound)) {
      lost(TOKEN_WITHDRAWN, "Hub credential was withdrawn")
      return
    }
    if (state.readiness == HubRouteReadiness.READY && socket == null) reconnectNow()
  }

  private fun current(): Boolean = try { activeLease?.check(); !stopped && socket != null }
    catch (failure: java.io.IOException) { false }

  private fun lost(code: Int, reason: String) {
    socket = null
    val openMs = if (openedAt == 0L) null else System.currentTimeMillis() - openedAt
    openedAt = 0L
    listener.closed(code, reason)
    if (code == TOKEN_WITHDRAWN) { stopped = true; routes?.close(); routes = null }
    if (stopped) {
      NativeLog.info(SCOPE, "socket.lost") { mapOf("socket" to id, "closeCode" to code, "reasonLength" to reason.length, "openMs" to openMs, "retry" to false) }
      return
    }
    val delay = BACKOFF_MS[minOf(attempt, BACKOFF_MS.size - 1)]
    NativeLog.warn(SCOPE, "socket.lost") {
      mapOf("socket" to id, "closeCode" to code, "reason" to NativeLog.reasonText(reason), "openMs" to openMs, "retry" to true, "attempt" to attempt, "backoffMs" to delay)
    }
    attempt += 1
    handler.postDelayed({ if (!stopped) connect() }, delay)
  }

  private inner class Forwarder : WebSocketListener() {
    override fun onOpen(webSocket: WebSocket, response: Response) {
      if (webSocket != socket || !current()) {
        NativeLog.warn(SCOPE, "socket.open_ignored") { mapOf("socket" to id, "stale" to (webSocket != socket)) }
        return
      }
      attempt = 0
      openedAt = System.currentTimeMillis()
      NativeLog.info(SCOPE, "socket.opened") { mapOf("socket" to id, "status" to response.code, "protocol" to response.protocol.toString(), "subprotocol" to response.header("Sec-WebSocket-Protocol"), "tls" to response.handshake?.tlsVersion?.javaName) }
      listener.opened()
    }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (webSocket == socket && current()) {
        textIn.incrementAndGet()
        bytesIn.addAndGet(text.length.toLong())
        traffic()
        listener.text(text)
      }
    }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      if (webSocket == socket && current()) {
        binaryIn.incrementAndGet()
        bytesIn.addAndGet(bytes.size.toLong())
        traffic()
        listener.binary(bytes.toByteArray())
      }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      NativeLog.info(SCOPE, "socket.closing") { mapOf("socket" to id, "closeCode" to code, "reason" to NativeLog.reasonText(reason), "closedBy" to "peer") }
      webSocket.close(code, reason)
    }

    override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
      NativeLog.info(SCOPE, "socket.closed") { mapOf("socket" to id, "closeCode" to code, "reason" to NativeLog.reasonText(reason), "current" to (webSocket == socket)) }
      HubTransport.releaseSocket(scopeId, webSocket)
      if (webSocket == socket) handler.post { if (webSocket == socket) lost(code, reason) }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      NativeLog.warn(SCOPE, "socket.failed", t) {
        mapOf("socket" to id, "status" to response?.code, "current" to (webSocket == socket), "stopped" to stopped, "openMs" to if (openedAt == 0L) null else System.currentTimeMillis() - openedAt)
      }
      HubTransport.releaseSocket(scopeId, webSocket)
      if (webSocket == socket) handler.post { if (webSocket == socket) {
        binding?.let { authority?.failed(it) }
        lost(response?.code ?: FAILED, t.message ?: t.javaClass.simpleName)
      } }
    }
  }

  companion object {
    private const val SCOPE = "voice-socket"
    private const val SUMMARY_MS = 5_000L
    private val NEXT_ID = AtomicLong()
    const val TOKEN_WITHDRAWN = 4001
    private const val NORMAL = 1000
    private const val FAILED = 1006
    private val BACKOFF_MS = longArrayOf(1_000, 2_000, 4_000, 8_000, 16_000, 30_000)
    const val DEFAULT_PING_SECONDS = 15L
  }
}
