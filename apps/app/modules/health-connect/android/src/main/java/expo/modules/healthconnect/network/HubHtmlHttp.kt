package expo.modules.healthconnect.network

import expo.modules.healthconnect.diagnostics.NativeLog
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
      require(message.decoderResult().isSuccess && !answered) { "The request could not be decoded" }
      when (message) {
        is HttpRequest -> {
          require(request == null) { "Only one request is served per connection" }
          require(allowsPath(message.uri())) { "The path ${message.uri()} is not a page path" }
          require(message.method() == HttpMethod.GET || message.method() == HttpMethod.HEAD) { "Only GET and HEAD are served" }
          validateHeaders(message.headers())
          request = message
        }
        is HttpContent -> {
          require(!message.content().isReadable) { "The request carries a body" }
          if (message is LastHttpContent) { require(message.trailingHeaders().isEmpty) { "The request carries trailers" }; answer(context) }
        }
        else -> error("Unexpected HTML HTTP message")
      }
    } catch (failure: Exception) { reject(context, failure) }
  }
  private fun validateHeaders(headers: HttpHeaders) {
    require(!headers.contains("Authorization")) { "The request carries credentials" }
    require(!headers.contains("Transfer-Encoding") && !headers.contains("Expect")) { "The request carries a body framing header" }
    require(!headers.contains("Content-Length") || headers.get("Content-Length") == "0") { "The request carries a body" }
  }
  private fun answer(context: ChannelHandlerContext) {
    val input = request ?: error("HTML HTTP requires its root request")
    broker.check()
    answered = true
    require(broker.gate.admits(input.headers().getAll("Cookie"))) { "The request does not carry the page key" }
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
  private fun reject(context: ChannelHandlerContext, failure: Exception) {
    answered = true
    explain(context, HttpResponseStatus.FORBIDDEN, "This page request was refused: ${failure.message}", failure)
  }
  override fun exceptionCaught(context: ChannelHandlerContext, cause: Throwable) { context.close() }
}

internal fun explain(context: ChannelHandlerContext, status: HttpResponseStatus, reason: String, failure: Throwable) {
  android.util.Log.w("HubHtml", reason, failure)
  NativeLog.warn("hub-html", "request.refused", failure) { mapOf("status" to status.code(), "reason" to NativeLog.reasonText(reason)) }
  val body = Unpooled.copiedBuffer(reason, Charsets.UTF_8)
  val response = DefaultFullHttpResponse(HttpVersion.HTTP_1_1, status, body)
  response.headers().set("Content-Type", "text/plain; charset=utf-8").set("Content-Length", body.readableBytes()).set("Connection", "close")
  context.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE)
}
