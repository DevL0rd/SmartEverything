package expo.modules.healthconnect.network

import io.netty.buffer.Unpooled
import io.netty.channel.ChannelFutureListener
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

class HubServerRelay(private val input: HubHtmlInput, private val policy: HubRoutePolicy, private val check: () -> Unit) : AutoCloseable {
  private val calls = java.util.concurrent.ConcurrentHashMap.newKeySet<Call>()
  private val sockets = java.util.concurrent.ConcurrentHashMap.newKeySet<WebSocket>()
  private val io = java.util.concurrent.ThreadPoolExecutor(0, 16, 30, TimeUnit.SECONDS, java.util.concurrent.SynchronousQueue())
  @Volatile private var closed = false
  private val prefix = input.page.assetPrefix()
  fun serve(context: ChannelHandlerContext, request: FullHttpRequest) {
    val body = ByteArray(request.content().readableBytes()).also { request.content().readBytes(it) }
    val method = request.method().name()
    val uri = request.uri()
    val headers = forwarded(request.headers())
    io.execute { transfer(context, method, uri, headers, body) }
  }
  private fun forwarded(headers: HttpHeaders): List<Pair<String, String>> =
    headers.entries().filter { it.key.lowercase() !in HOP }.map { it.key to it.value }
  private fun outbound(uri: String, headers: List<Pair<String, String>>): Pair<HubLease, Request.Builder> {
    check(!closed); check.invoke()
    val lease = policy.lease(input.binding, input.binding.canonicalOrigin + prefix + uri)
    val builder = Request.Builder().url(lease.url)
    headers.forEach { (name, value) -> builder.addHeader(name, value) }
    builder.header("Authorization", input.authorization).header("Accept-Encoding", "identity")
    return lease to builder
  }
  private fun transfer(context: ChannelHandlerContext, method: String, uri: String, headers: List<Pair<String, String>>, body: ByteArray) {
    var call: Call? = null
    var sent = false
    try {
      val (lease, builder) = outbound(uri, headers)
      val type = headers.firstOrNull { it.first.equals("Content-Type", true) }?.second?.toMediaTypeOrNull()
      val payload = if (method == "GET" || method == "HEAD") null else body.toRequestBody(type)
      val active = lease.client.newBuilder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false)
        .readTimeout(0, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS).build().newCall(builder.method(method, payload).build())
      call = active
      calls.add(active)
      context.channel().closeFuture().addListener { active.cancel() }
      active.execute().use { response ->
        lease.check(); check.invoke()
        context.writeAndFlush(head(response)).syncUninterruptibly().also { check(it.isSuccess) }
        sent = true
        if (method != "HEAD") stream(context, response) { check(!closed); lease.check(); check.invoke() }
        context.writeAndFlush(LastHttpContent.EMPTY_LAST_CONTENT).addListener(ChannelFutureListener.CLOSE)
      }
    } catch (failure: Exception) {
      if (failure is java.io.IOException && call?.isCanceled() != true && !closed && runCatching(check).isSuccess) policy.failed(input.binding)
      if (sent) context.close() else explain(context, HttpResponseStatus.BAD_GATEWAY, "The server could not be reached: ${failure.message ?: failure.javaClass.simpleName}", failure)
    } finally { call?.let { calls.remove(it); it.cancel() } }
  }
  private fun head(response: Response): HttpResponse {
    val result = DefaultHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(response.code))
    response.headers.forEach { (name, value) -> if (name.lowercase() !in HOP) result.headers().add(name, local(name, value)) }
    result.headers().set("Connection", "close")
    if (!result.headers().contains("Content-Length")) HttpUtil.setTransferEncodingChunked(result, true)
    return result
  }
  private fun local(name: String, value: String): String =
    if (name.equals("Location", true) && value.startsWith("$prefix/")) value.removePrefix(prefix) else value
  private fun stream(context: ChannelHandlerContext, response: Response, check: () -> Unit) {
    val body = response.body ?: error("The server response has no stream")
    body.byteStream().use { source ->
      val buffer = ByteArray(32768)
      while (true) {
        check.invoke()
        val count = source.read(buffer)
        if (count < 0) return
        check(context.channel().isActive)
        context.writeAndFlush(DefaultHttpContent(Unpooled.copiedBuffer(buffer, 0, count))).syncUninterruptibly().also { check(it.isSuccess) }
      }
    }
  }
  fun socket(context: ChannelHandlerContext, request: FullHttpRequest) {
    val (lease, builder) = outbound(request.uri(), forwarded(request.headers()))
    val bridge = HubServerSocket(context, request.retain(), lease.url) { check(!closed); lease.check(); check.invoke() }
    val client = lease.client.newBuilder().readTimeout(0, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS).build()
    val socket = client.newWebSocket(builder.build(), object : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) = bridge.opened(webSocket, response.header("Sec-WebSocket-Protocol"))
      override fun onMessage(webSocket: WebSocket, text: String) = bridge.text(text)
      override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) = bridge.binary(bytes.toByteArray())
      override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, null); bridge.closed() }
      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) { sockets.remove(webSocket); bridge.closed() }
      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) { sockets.remove(webSocket); bridge.failed(t, response?.code) }
    })
    sockets.add(socket)
    context.channel().closeFuture().addListener { socket.cancel(); sockets.remove(socket) }
  }
  override fun close() { closed = true; calls.toList().forEach { it.cancel() }; sockets.toList().forEach { it.cancel() }; io.shutdownNow() }
  companion object {
    private val HOP = setOf("connection", "keep-alive", "proxy-connection", "transfer-encoding", "upgrade", "te", "trailer", "host", "content-length", "authorization", "accept-encoding",
      "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions", "sec-websocket-accept")
  }
}
