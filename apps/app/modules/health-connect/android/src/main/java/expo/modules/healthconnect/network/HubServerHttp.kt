package expo.modules.healthconnect.network

import io.netty.channel.ChannelHandlerContext
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpHeaderValues
import io.netty.handler.codec.http.HttpResponseStatus

class HubServerHttp(private val broker: HubHtmlBroker, private val relay: HubServerRelay) : SimpleChannelInboundHandler<FullHttpRequest>() {
  private var answered = false
  override fun channelRead0(context: ChannelHandlerContext, request: FullHttpRequest) {
    try {
      require(request.decoderResult().isSuccess && !answered) { "The request could not be decoded" }
      require(allowsPath(request.uri())) { "The path ${request.uri()} is not a page path" }
      require(request.method().name() in METHODS) { "${request.method().name()} is not relayed" }
      broker.check()
      answered = true
      require(broker.gate.admits(request.headers().getAll("Cookie"))) { "The request does not carry the page key" }
      context.pipeline().remove(io.netty.handler.timeout.ReadTimeoutHandler::class.java)
      if (request.headers().containsValue("Upgrade", HttpHeaderValues.WEBSOCKET, true)) relay.socket(context, request)
      else relay.serve(context, request)
    } catch (failure: Exception) {
      answered = true
      explain(context, HttpResponseStatus.FORBIDDEN, "This page request was refused: ${failure.message}", failure)
    }
  }
  override fun exceptionCaught(context: ChannelHandlerContext, cause: Throwable) { context.close() }
  private companion object {
    val METHODS = setOf("GET", "HEAD", "POST", "PUT", "PATCH", "DELETE")
  }
}
