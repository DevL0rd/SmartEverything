package expo.modules.healthconnect.network

import android.content.Context
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.socket.SocketChannel
import io.netty.handler.codec.http.HttpDecoderConfig
import io.netty.handler.codec.http.HttpServerCodec
import io.netty.handler.timeout.ReadTimeoutHandler

class HubHtmlBroker(context: Context, val id: String, val page: HubHtmlPage, private val check: () -> Unit, val assets: HubHtmlAssets) : AutoCloseable {
  private val connections = java.util.concurrent.atomic.AtomicInteger()
  private val channels = java.util.concurrent.ConcurrentHashMap.newKeySet<Channel>()
  private val server: Channel
  @Volatile private var closed = false
  val port: Int
  init {
    server = HubHtmlRuntime.open(context, id, object : ChannelInitializer<SocketChannel>() {
      override fun initChannel(channel: SocketChannel) {
        if (connections.incrementAndGet() > 8) { connections.decrementAndGet(); channel.close(); return }
        channels.add(channel)
        channel.closeFuture().addListener { connections.decrementAndGet(); channels.remove(channel) }
        channel.pipeline().addLast(ReadTimeoutHandler(10))
          .addLast(HttpServerCodec(HttpDecoderConfig().setMaxInitialLineLength(4096).setMaxHeaderSize(8192).setMaxChunkSize(4096).setValidateHeaders(true)))
          .addLast(HubHtmlHttp(this@HubHtmlBroker))
      }
    })
    port = requireNotNull(java.net.InetSocketAddress::class.java.cast(server.localAddress())) { "Native page listener has no loopback address" }.port
  }
  fun check() { check(!closed); check.invoke() }
  fun origin(): String = "http://127.0.0.1:$port"
  fun url(): String = origin() + "/"
  @Synchronized override fun close() {
    if (closed) return
    closed = true
    assets.close()
    server.close().syncUninterruptibly()
    channels.toList().forEach { it.close() }
    HubHtmlRuntime.release()
  }
}
