package expo.modules.healthconnect.network

import io.netty.channel.ChannelHandlerContext
import io.netty.channel.ChannelInitializer
import io.netty.channel.ChannelOutboundHandlerAdapter
import io.netty.channel.ChannelPromise
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.channel.socket.SocketChannel
import io.netty.handler.codec.TooLongFrameException
import io.netty.handler.codec.http.DefaultHttpHeaders
import io.netty.handler.codec.http.HttpClientCodec
import io.netty.handler.codec.http.HttpObjectAggregator
import io.netty.handler.codec.http.websocketx.PongWebSocketFrame
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame
import io.netty.handler.codec.http.websocketx.CorruptedWebSocketFrameException
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame
import io.netty.handler.codec.http.websocketx.WebSocketClientProtocolConfig
import io.netty.handler.codec.http.websocketx.WebSocketClientProtocolHandler
import io.netty.handler.codec.http.websocketx.WebSocketFrame
import io.netty.handler.codec.http.websocketx.WebSocketFrameAggregator
import io.netty.handler.ssl.SslHandler
import io.netty.handler.proxy.HttpProxyHandler
import io.netty.handler.proxy.Socks5ProxyHandler
import java.net.Proxy
import io.netty.util.ReferenceCountUtil
import java.net.URI
import okhttp3.Request

interface HubSocketEvents {
  fun opened(protocol: String)
  fun text(bytes: ByteArray)
  fun binary(bytes: ByteArray)
  fun closing(code: Int, reason: String)
  fun failed(cause: Throwable)
  fun oversized()
  fun inactive()
  fun pong()
}
class HubSocketPipeline(private val lease: HubLease, private val request: Request, private val events: HubSocketEvents, private val proxy: Proxy) : ChannelInitializer<SocketChannel>() {
  override fun initChannel(channel: SocketChannel) {
    lease.check()
    val uri = URI(lease.url.replaceFirst("https:", "wss:").replaceFirst("http:", "ws:"))
    val pipeline = channel.pipeline()
    when (proxy.type()) {
      Proxy.Type.HTTP -> pipeline.addLast(HttpProxyHandler(proxy.address()).apply { setConnectTimeoutMillis(15_000) })
      Proxy.Type.SOCKS -> pipeline.addLast(Socks5ProxyHandler(proxy.address()).apply { setConnectTimeoutMillis(15_000) })
      else -> Unit
    }
    if (uri.scheme == "wss") pipeline.addLast(SslHandler(lease.sslEngine()))
    pipeline.addLast(Guard(lease))
    pipeline.addLast(HttpClientCodec(4096, 16_384, 8192))
    pipeline.addLast(HttpObjectAggregator(16_384))
    val headers = DefaultHttpHeaders()
    for (name in request.headers.names()) if (!name.equals("Sec-WebSocket-Protocol", true)) headers.set(name, request.header(name))
    val config = WebSocketClientProtocolConfig.newBuilder().webSocketUri(uri)
      .subprotocol(request.header("Sec-WebSocket-Protocol")).customHeaders(headers)
      .allowExtensions(false).maxFramePayloadLength(MAX_BYTES).handleCloseFrames(false)
      .dropPongFrames(false).generateOriginHeader(false).handshakeTimeoutMillis(15_000).forceCloseTimeoutMillis(1000).build()
    val protocol = WebSocketClientProtocolHandler(config)
    pipeline.addLast(protocol)
    pipeline.addLast(WebSocketFrameAggregator(MAX_BYTES))
    pipeline.addLast(Receiver(events, protocol))
  }
  private class Guard(private val lease: HubLease) : ChannelOutboundHandlerAdapter() {
    override fun write(context: ChannelHandlerContext, message: Any, promise: ChannelPromise) {
      try { lease.check() }
      catch (failure: Exception) {
        ReferenceCountUtil.release(message)
        promise.setFailure(failure)
        context.close()
        return
      }
      context.write(message, promise)
    }
  }
  private class Receiver(private val events: HubSocketEvents, private val protocol: WebSocketClientProtocolHandler) : SimpleChannelInboundHandler<WebSocketFrame>() {
    override fun userEventTriggered(context: ChannelHandlerContext, event: Any) {
      when (event) {
        WebSocketClientProtocolHandler.ClientHandshakeStateEvent.HANDSHAKE_COMPLETE -> events.opened(protocol.handshaker().actualSubprotocol() ?: "")
        WebSocketClientProtocolHandler.ClientHandshakeStateEvent.HANDSHAKE_TIMEOUT -> events.failed(java.io.IOException("Hub socket opening timed out"))
        else -> context.fireUserEventTriggered(event)
      }
    }
    override fun channelRead0(context: ChannelHandlerContext, frame: WebSocketFrame) {
      when (frame) {
        is TextWebSocketFrame -> events.text(copy(frame))
        is BinaryWebSocketFrame -> events.binary(copy(frame))
        is PongWebSocketFrame -> events.pong()
        is CloseWebSocketFrame -> events.closing(frame.statusCode(), frame.reasonText())
      }
    }
    private fun copy(frame: WebSocketFrame): ByteArray {
      require(frame.content().readableBytes() <= MAX_BYTES)
      return ByteArray(frame.content().readableBytes()).also { frame.content().getBytes(frame.content().readerIndex(), it) }
    }
    override fun exceptionCaught(context: ChannelHandlerContext, cause: Throwable) {
      if (cause is TooLongFrameException || (cause is CorruptedWebSocketFrameException && cause.closeStatus().code() == 1009)) events.oversized()
      else events.failed(cause)
      context.close()
    }
    override fun channelInactive(context: ChannelHandlerContext) { context.executor().execute { events.inactive() } }
  }
  companion object { const val MAX_BYTES = 1024 * 1024 }
}
