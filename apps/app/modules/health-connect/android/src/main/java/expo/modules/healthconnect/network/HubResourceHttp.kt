package expo.modules.healthconnect.network

import io.netty.channel.ChannelHandlerContext
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.handler.codec.http.*
import java.util.concurrent.RejectedExecutionException
import okhttp3.Call

class HubResourceHttp(private val broker: HubResourceBroker) : SimpleChannelInboundHandler<HttpObject>() {
  private var request: HttpRequest? = null
  private var admitted = false
  private var grant: HubResourceGrant? = null
  private var call: Call? = null
  private var admissionDeadline: java.util.concurrent.ScheduledFuture<*>? = null
  override fun channelActive(context: ChannelHandlerContext) {
    admissionDeadline = context.executor().schedule({ if (!admitted) context.close() }, 10, java.util.concurrent.TimeUnit.SECONDS)
    context.fireChannelActive()
  }
  override fun channelRead0(context: ChannelHandlerContext, message: HttpObject) {
    try {
      require(message.decoderResult().isSuccess)
      when (message) {
        is HttpRequest -> {
          require(request == null && !admitted)
          validate(message)
          request = message
        }
        is HttpContent -> {
          require(!admitted && !message.content().isReadable)
          if (message is LastHttpContent) { require(message.trailingHeaders().isEmpty); admit(context) }
        }
        else -> error("Unexpected HTTP message")
      }
    } catch (failure: Exception) { if (admitted) context.close() else reject(context) }
  }
  private fun validate(input: HttpRequest) {
    require(input.protocolVersion() == HttpVersion.HTTP_1_1)
    require(input.method() == HttpMethod.GET || input.method() == HttpMethod.HEAD)
    require(Regex("/resource/[0-9a-f]{64}").matches(input.uri()))
    val headers = input.headers()
    require(headers.size() <= 24 && headers.getAll("Host") == listOf("127.0.0.1:${broker.port}"))
    require(headers.getAll("Origin").isEmpty()) { "Browser origins cannot consume native media grants" }
    headers.names().forEach { name ->
      require(name.lowercase() in ALLOWED_HEADERS && headers.getAll(name).size == 1)
      require(headers.get(name).length <= 4096)
    }
    require(!headers.contains("Transfer-Encoding") && !headers.contains("Expect"))
    require(!headers.contains("Content-Length") || headers.get("Content-Length") == "0")
    grant = broker.grants.get(input.uri().removePrefix("/resource/"))
  }
  private fun admit(context: ChannelHandlerContext) {
    val input = request ?: error("Missing HTTP request")
    val selected = grant ?: error("Missing resource grant")
    admitted = true
    admissionDeadline?.cancel(false)
    selected.track(context.channel())
    context.pipeline().remove("headersDeadline")
    context.channel().config().isAutoRead = true
    val upstream = HubResourceStream.request(selected, input.headers())
    call = upstream
    try { broker.io.execute { HubResourceStream.relay(broker.grants, selected, upstream, input.method() == HttpMethod.HEAD, context) } }
    catch (failure: RejectedExecutionException) { upstream.cancel(); selected.untrack(upstream); reject(context) }
  }
  private fun reject(context: ChannelHandlerContext) {
    val response = DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.BAD_REQUEST)
    response.headers().set(HttpHeaderNames.CONTENT_LENGTH, 0).set(HttpHeaderNames.CONNECTION, "close")
    context.writeAndFlush(response).addListener(io.netty.channel.ChannelFutureListener.CLOSE)
  }
  override fun channelInactive(context: ChannelHandlerContext) { admissionDeadline?.cancel(false); call?.cancel(); grant?.untrack(context.channel()) }
  override fun exceptionCaught(context: ChannelHandlerContext, cause: Throwable) { context.close() }
  companion object {
    private val ALLOWED_HEADERS = setOf("host", "range", "if-range", "if-none-match", "if-modified-since", "if-match", "if-unmodified-since",
      "accept", "accept-encoding", "user-agent", "connection", "content-length")
  }
}
