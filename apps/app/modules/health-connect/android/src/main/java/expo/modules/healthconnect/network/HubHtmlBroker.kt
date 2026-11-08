package expo.modules.healthconnect.network

import android.content.Context
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.socket.SocketChannel
import io.netty.handler.codec.http.HttpDecoderConfig
import io.netty.handler.codec.http.HttpObjectAggregator
import io.netty.handler.codec.http.HttpServerCodec
import io.netty.handler.timeout.ReadTimeoutHandler

class HubHtmlBroker(context: Context, val id: String, val page: HubHtmlPage, private val check: () -> Unit, val assets: HubHtmlAssets, private val relay: HubServerRelay?) : AutoCloseable {
  private val channels = java.util.concurrent.ConcurrentHashMap.newKeySet<Channel>()
  private val server: Channel
  val gate = HubHtmlGate { port }
  @Volatile private var closed = false
  val port: Int
  init {
    server = HubHtmlRuntime.open(context, id, object : ChannelInitializer<SocketChannel>() {
      override fun initChannel(channel: SocketChannel) {
        channels.add(channel)
        channel.closeFuture().addListener { channels.remove(channel) }
        val pipeline = channel.pipeline().addLast(ReadTimeoutHandler(10))
        if (relay == null) pipeline
          .addLast(HttpServerCodec(HttpDecoderConfig().setMaxInitialLineLength(4096).setMaxHeaderSize(8192).setMaxChunkSize(4096).setValidateHeaders(true)))
          .addLast(HubHtmlHttp(this@HubHtmlBroker))
        else pipeline
          .addLast(HttpServerCodec(HttpDecoderConfig().setMaxInitialLineLength(16384).setMaxHeaderSize(65536).setValidateHeaders(true)))
          .addLast(HttpObjectAggregator(Int.MAX_VALUE))
          .addLast(HubServerHttp(this@HubHtmlBroker, relay))
      }
    })
    port = requireNotNull(java.net.InetSocketAddress::class.java.cast(server.localAddress())) { "Native page listener has no loopback address" }.port
  }
  fun check() { check(!closed); check.invoke() }
  fun origin(): String = "http://127.0.0.1:$port"
  @Synchronized override fun close() {
    if (closed) return
    closed = true
    assets.close()
    relay?.close()
    server.close().syncUninterruptibly()
    channels.toList().forEach { it.close() }
    HubHtmlRuntime.release()
  }
}
