package expo.modules.healthconnect.network

import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString
import org.json.JSONArray
import org.json.JSONObject

class HubSockets(private val emit: (Map<String, Any?>) -> Unit, private val authority: (() -> HubRoutePolicy)? = null) {
  private data class Entry(val scopeId: String, val socket: WebSocket, val lease: HubLease, val binding: HubRouteBinding?, val policy: HubRoutePolicy?)
  private val sockets = mutableMapOf<String, Entry>()
  @Synchronized fun open(json: String) {
    val input = JSONObject(json)
    val id = input.getString("id")
    val scope = input.getString("scopeId")
    require(id.length in 1..100 && scope.length in 1..200 && sockets.size < 32 && !sockets.containsKey(id))
    val url = input.getString("url")
    require(url.startsWith("wss:") || url.startsWith("ws:"))
    val binding = input.optJSONObject("binding")?.let { HubRouteBinding.parse(it) }
    require((binding != null) == input.has("routeGeneration"))
    require(binding == null || binding.scopeId == scope)
    val policy = if (binding == null) null else authority?.invoke() ?: error("Route authority is unavailable")
    val lease = if (binding == null) HubTransport.lease(url, scope)
      else policy?.lease(binding, url, input.getLong("routeGeneration")) ?: error("Missing route authority")
    val protocols = input.getJSONArray("protocols")
    require(protocols.length() <= 8)
    val values = (0 until protocols.length()).map { protocols.getString(it).also { value -> require(value.length in 1..4096 && value.matches(Regex("[!#$%&'*+.^_`|~0-9a-zA-Z-]+"))) } }
    val request = Request.Builder().url(lease.url).apply { if (values.isNotEmpty()) header("Sec-WebSocket-Protocol", values.joinToString(", ")) }.build()
    val socket = HubBoundedSocket(lease, request, Forwarder(id))
    sockets[id] = Entry(scope, socket, lease, binding, policy)
    HubTransport.trackSocket(scope, socket)
    socket.start()
  }
  @Synchronized fun send(json: String) {
    val input = JSONObject(json)
    val entry = sockets[input.getString("id")] ?: error("Hub socket is not open")
    entry.lease.check()
    val socket = entry.socket
    val data = input.get("data")
    val accepted = when (data) {
      is String -> { require(socket.queueSize() + data.toByteArray().size <= MAX_BYTES); socket.send(data) }
      is JSONArray -> {
        require(socket.queueSize() + data.length() <= MAX_BYTES)
        val bytes = ByteArray(data.length()) { index -> data.getInt(index).also { require(it in 0..255) }.toByte() }
        socket.send(bytes.toByteString())
      }
      else -> error("Hub socket data must be text or bytes")
    }
    require(accepted) { "Hub socket send failed" }
  }
  @Synchronized fun close(id: String) { sockets.remove(id)?.let { HubTransport.releaseSocket(it.scopeId, it.socket); it.socket.cancel() } }
  @Synchronized fun clearScope(scopeId: String) {
    sockets.filterValues { it.scopeId == scopeId }.keys.toList().forEach { id ->
      emit(mapOf("id" to id, "kind" to "close", "code" to 1001, "reason" to "Hub trust withdrawn"))
      close(id)
    }
  }
  @Synchronized fun stop() { sockets.keys.toList().forEach { close(it) } }
  @Synchronized private fun current(id: String, socket: WebSocket): Boolean = sockets[id]?.socket == socket
  @Synchronized private fun valid(id: String, socket: WebSocket): Boolean = try {
    val entry = sockets[id] ?: return false
    entry.lease.check()
    entry.socket == socket
  } catch (failure: java.io.IOException) { false }
  @Synchronized private fun failed(id: String, socket: WebSocket) {
    val entry = sockets[id] ?: return
    if (entry.socket != socket) return
    entry.binding?.let { entry.policy?.failed(it, entry.lease.routeGeneration) }
    finished(id, socket, 1006, "Hub socket transport failed")
  }
  @Synchronized private fun finished(id: String, socket: WebSocket, code: Int, reason: String) {
    if (!current(id, socket)) return
    val entry = sockets.remove(id)
    HubTransport.releaseSocket(entry?.scopeId, socket)
    emit(mapOf("id" to id, "kind" to "close", "code" to code, "reason" to reason.take(500)))
  }
  private inner class Forwarder(private val id: String) : WebSocketListener() {
    override fun onOpen(socket: WebSocket, response: Response) {
      if (valid(id, socket)) emit(mapOf("id" to id, "kind" to "open", "protocol" to (response.header("Sec-WebSocket-Protocol") ?: "")))
    }
    override fun onMessage(socket: WebSocket, text: String) {
      if (text.toByteArray().size > MAX_BYTES) { socket.close(1009, "Hub message limit exceeded"); return }
      if (valid(id, socket)) emit(mapOf("id" to id, "kind" to "message", "data" to text))
    }
    override fun onMessage(socket: WebSocket, bytes: ByteString) {
      if (bytes.size > MAX_BYTES) { socket.close(1009, "Hub message limit exceeded"); return }
      if (valid(id, socket)) emit(mapOf("id" to id, "kind" to "message", "data" to bytes.toByteArray().map { it.toInt() and 255 }))
    }
    override fun onClosing(socket: WebSocket, code: Int, reason: String) { socket.close(code, reason) }
    override fun onClosed(socket: WebSocket, code: Int, reason: String) { finished(id, socket, code, reason) }
    override fun onFailure(socket: WebSocket, failure: Throwable, response: Response?) { failed(id, socket) }
  }
  companion object { private const val MAX_BYTES = 1024 * 1024 }
}
