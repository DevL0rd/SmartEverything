package expo.modules.healthconnect.network

import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.channel.ChannelFutureListener
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.handler.codec.http.*

class HubHtmlHttp(private val broker: HubHtmlBroker) : SimpleChannelInboundHandler<HttpObject>() {
  private var request: HttpRequest? = null
  private var answered = false
  override fun channelRead0(context: ChannelHandlerContext, message: HttpObject) {
    try {
      require(message.decoderResult().isSuccess && !answered)
      when (message) {
        is HttpRequest -> {
          require(request == null)
          require(message.protocolVersion() == HttpVersion.HTTP_1_1 && allowsPath(message.uri()))
          require(message.method() == HttpMethod.GET || message.method() == HttpMethod.HEAD)
          val headers = message.headers()
          require(headers.getAll("Host") == listOf("127.0.0.1:${broker.port}"))
          require((!headers.contains("Cookie") || HubBrowserPolicy.supported()) && !headers.contains("Authorization") && (!headers.contains("Origin") || (broker.document is HubHtmlProject && headers.get("Origin") == broker.origin())))
          require(!headers.contains("Transfer-Encoding") && !headers.contains("Expect"))
          require(!headers.contains("Content-Length") || headers.get("Content-Length") == "0")
          require(headers.size() <= 24)
          headers.names().forEach { require(headers.getAll(it).size == 1 && it.lowercase() in HEADERS) }
          request = message
        }
        is HttpContent -> {
          require(!message.content().isReadable)
          if (message is LastHttpContent) { require(message.trailingHeaders().isEmpty); answer(context) }
        }
        else -> error("Unexpected HTML HTTP message")
      }
    } catch (failure: Exception) { reject(context) }
  }
  private fun answer(context: ChannelHandlerContext) {
    val input = request ?: error("HTML HTTP requires its root request")
    broker.check()
    answered = true
    context.pipeline().remove(io.netty.handler.timeout.ReadTimeoutHandler::class.java)
    val document = broker.document
    if (document is HubHtmlProject) {
      val assets = broker.assets ?: error("Project projection requires its asset transport")
      assets.serve(context, input.method().name(), input.uri(), input.headers().get("Range"))
      return
    }
    require(document is HubHtmlPage)
    val bytes = document.html.toByteArray(Charsets.UTF_8)
    val response = DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.OK,
      if (input.method() == HttpMethod.HEAD) Unpooled.EMPTY_BUFFER else Unpooled.wrappedBuffer(bytes))
    response.headers().set("Content-Type", "text/html; charset=utf-8").set("Content-Length", bytes.size)
      .set("Content-Security-Policy", if (HubBrowserPolicy.supported()) STORAGE_CSP else CSP).set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer")
      .set("X-Content-Type-Options", "nosniff").set("Connection", "close")
    context.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE)
  }
  private fun allowsPath(path: String): Boolean {
    if (broker.document is HubHtmlPage) return path == "/${broker.id}/"
    val parsed = java.net.URI(path)
    return path.startsWith("/") && !path.startsWith("//") && parsed.rawAuthority == null && parsed.rawFragment == null &&
      !path.contains('\\') && !path.contains('\r') && !path.contains('\n')
  }
  private fun reject(context: ChannelHandlerContext) {
    answered = true
    val response = DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.FORBIDDEN)
    response.headers().set("Content-Length", 0).set("Connection", "close")
    context.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE)
  }
  override fun exceptionCaught(context: ChannelHandlerContext, cause: Throwable) { context.close() }
  companion object {
    private val HEADERS = setOf("host", "x-requested-with", "accept", "accept-encoding", "accept-language", "user-agent", "connection", "content-length", "cache-control", "pragma", "upgrade-insecure-requests", "sec-fetch-dest", "sec-fetch-mode", "sec-fetch-site", "sec-fetch-user", "range", "origin", "cookie")
    val STORAGE_CSP: String get() = CSP.replace("sandbox allow-scripts allow-modals", "sandbox allow-scripts allow-same-origin allow-modals")
    const val CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; frame-ancestors 'none'; sandbox allow-scripts allow-modals"
  }
}
