package expo.modules.healthconnect.network

import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.channel.SimpleChannelInboundHandler
import io.netty.handler.codec.http.FullHttpRequest
import io.netty.handler.codec.http.HttpResponseStatus
import io.netty.handler.codec.http.websocketx.*
import okhttp3.WebSocket
import okio.ByteString.Companion.toByteString

class HubServerSocket(private val context: ChannelHandlerContext, private val request: FullHttpRequest, private val url: String, private val check: () -> Unit) {
  @Volatile private var open = false
  fun opened(socket: WebSocket, protocol: String?) = context.executor().execute {
    try {
      check.invoke()
      val location = url.replaceFirst("https://", "wss://").replaceFirst("http://", "ws://")
      val shaker = WebSocketServerHandshakerFactory(location, protocol, false, Int.MAX_VALUE).newHandshaker(request)
        ?: error("This WebSocket version is not supported")
      context.pipeline().remove(HubServerHttp::class.java)
      context.pipeline().addLast(Frames(socket, shaker))
      shaker.handshake(context.channel(), request).addListener { if (it.isSuccess) open = true else socket.cancel() }
    } catch (failure: Exception) { socket.cancel(); explain(context, HttpResponseStatus.FORBIDDEN, "The server socket was refused: ${failure.message}", failure) }
    finally { request.release() }
  }
  fun text(value: String) { if (open) context.writeAndFlush(TextWebSocketFrame(value)) }
  fun binary(value: ByteArray) { if (open) context.writeAndFlush(BinaryWebSocketFrame(Unpooled.wrappedBuffer(value))) }
  fun closed() { context.close() }
  fun failed(failure: Throwable, status: Int?) {
    if (open) { context.close(); return }
    context.executor().execute {
      if (request.refCnt() > 0) request.release()
      explain(context, HttpResponseStatus.BAD_GATEWAY, "The server socket could not be opened${status?.let { " (HTTP $it)" } ?: ""}: ${failure.message}", failure)
    }
  }
  private inner class Frames(private val socket: WebSocket, private val shaker: WebSocketServerHandshaker) : SimpleChannelInboundHandler<WebSocketFrame>() {
    override fun channelRead0(ctx: ChannelHandlerContext, frame: WebSocketFrame) {
      try { check.invoke() } catch (failure: Exception) { socket.cancel(); ctx.close(); return }
      when (frame) {
        is TextWebSocketFrame -> socket.send(frame.text())
        is BinaryWebSocketFrame -> socket.send(ByteArray(frame.content().readableBytes()).also { frame.content().readBytes(it) }.toByteString())
        is PingWebSocketFrame -> ctx.writeAndFlush(PongWebSocketFrame(frame.content().retain()))
        is CloseWebSocketFrame -> { socket.close(1000, null); shaker.close(ctx.channel(), frame.retain()) }
        else -> Unit
      }
    }
    override fun channelInactive(ctx: ChannelHandlerContext) { socket.close(1001, null); super.channelInactive(ctx) }
  }
}
