package expo.modules.healthconnect.network

import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.ChannelOption
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.SocketChannel
import io.netty.channel.socket.nio.NioServerSocketChannel
import io.netty.handler.codec.http.HttpDecoderConfig
import io.netty.handler.codec.http.HttpServerCodec
import io.netty.handler.timeout.ReadTimeoutHandler
import java.net.InetSocketAddress

class HubHtmlBroker(val id: String, val document: HubHtmlDocument, private val check: () -> Unit, val assets: HubHtmlAssets?) : AutoCloseable {
  private val boss = NioEventLoopGroup(1)
  private val workers = NioEventLoopGroup(1)
  private val connections = java.util.concurrent.atomic.AtomicInteger()
  private val channels = java.util.concurrent.ConcurrentHashMap.newKeySet<Channel>()
  private val server: Channel
  val port: Int
  init {
    try {
      server = ServerBootstrap().group(boss, workers).channel(NioServerSocketChannel::class.java)
        .option(ChannelOption.SO_BACKLOG, 8).childOption(ChannelOption.AUTO_READ, true)
        .childHandler(object : ChannelInitializer<SocketChannel>() {
          override fun initChannel(channel: SocketChannel) {
            if (connections.incrementAndGet() > 8) { connections.decrementAndGet(); channel.close(); return }
            channels.add(channel)
            channel.closeFuture().addListener { connections.decrementAndGet(); channels.remove(channel) }
            channel.pipeline().addLast(ReadTimeoutHandler(10))
              .addLast(HttpServerCodec(HttpDecoderConfig().setMaxInitialLineLength(4096).setMaxHeaderSize(8192).setMaxChunkSize(4096).setValidateHeaders(true)))
              .addLast(HubHtmlHttp(this@HubHtmlBroker))
          }
        }).bind("127.0.0.1", 0).syncUninterruptibly().channel()
      port = (server.localAddress() as InetSocketAddress).port
    } catch (failure: Exception) { boss.shutdownGracefully(); workers.shutdownGracefully(); throw failure }
  }
  fun check() { document.expiresAt?.let { require(java.time.Instant.parse(it) > java.time.Instant.now()) }; check.invoke() }
  fun origin(): String = "http://127.0.0.1:$port"
  fun url(): String = origin() + (if (document is HubHtmlProject) document.entryPath else "/$id/")
  override fun close() { assets?.close(); server.close(); channels.toList().forEach { it.close() }; boss.shutdownGracefully(); workers.shutdownGracefully() }
}
