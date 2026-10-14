package expo.modules.healthconnect.network

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
          require(request == null && message.protocolVersion() == HttpVersion.HTTP_1_1 && allowsPath(message.uri()))
          require(message.method() == HttpMethod.GET || message.method() == HttpMethod.HEAD)
          validateHeaders(message.headers())
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
  private fun validateHeaders(headers: HttpHeaders) {
    require(headers.getAll("Host") == listOf("127.0.0.1:${broker.port}"))
    require(!headers.contains("Authorization") && (!headers.contains("Origin") || headers.get("Origin") == broker.origin()))
    require(!headers.contains("Transfer-Encoding") && !headers.contains("Expect"))
    require(!headers.contains("Content-Length") || headers.get("Content-Length") == "0")
    require(headers.size() <= 24)
    headers.names().forEach { require(headers.getAll(it).size == 1 && it.lowercase() in HEADERS) }
  }
  private fun answer(context: ChannelHandlerContext) {
    val input = request ?: error("HTML HTTP requires its root request")
    broker.check()
    answered = true
    context.pipeline().remove(io.netty.handler.timeout.ReadTimeoutHandler::class.java)
    broker.assets.serve(context, input.method().name(), input.uri(), input.headers().get("Range"))
  }
  private fun allowsPath(path: String): Boolean {
    val parsed = java.net.URI(path)
    val decoded = java.net.URLDecoder.decode(parsed.rawPath.replace("+", "%2B"), "UTF-8")
    if (decoded.contains('\\') || decoded.contains('%') || decoded.contains('\u0000') || decoded.split('/').any { it == "." || it == ".." }) return false
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
  }
}
