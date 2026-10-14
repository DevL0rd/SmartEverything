package expo.modules.healthconnect.network

import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.ChannelOption
import io.netty.channel.WriteBufferWaterMark
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.SocketChannel
import io.netty.channel.socket.nio.NioServerSocketChannel
import io.netty.handler.codec.http.HttpDecoderConfig
import io.netty.handler.codec.http.HttpServerCodec
import io.netty.handler.timeout.ReadTimeoutHandler
import java.net.InetSocketAddress
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit

class HubResourceBroker(val grants: HubResourceGrants) : AutoCloseable {
  private val boss = NioEventLoopGroup(1)
  private val workers = NioEventLoopGroup(1)
  val io = ThreadPoolExecutor(4, 4, 0, TimeUnit.SECONDS, ArrayBlockingQueue(16), ThreadPoolExecutor.AbortPolicy())
  private val connections = java.util.concurrent.atomic.AtomicInteger()
  private val server: Channel
  val port: Int
  init {
    try {
      server = ServerBootstrap().group(boss, workers).channel(NioServerSocketChannel::class.java)
        .option(ChannelOption.SO_BACKLOG, 32).childOption(ChannelOption.AUTO_READ, true)
        .childOption(ChannelOption.WRITE_BUFFER_WATER_MARK, WriteBufferWaterMark(32768, 65536))
        .childHandler(object : ChannelInitializer<SocketChannel>() {
          override fun initChannel(channel: SocketChannel) {
            if (connections.incrementAndGet() > 32) { connections.decrementAndGet(); channel.close(); return }
            channel.closeFuture().addListener { connections.decrementAndGet() }
            channel.pipeline().addLast("headersDeadline", ReadTimeoutHandler(10))
              .addLast(HttpServerCodec(HttpDecoderConfig().setMaxInitialLineLength(4096)
                .setMaxHeaderSize(8192).setMaxChunkSize(32768).setValidateHeaders(true)))
              .addLast(HubResourceHttp(this@HubResourceBroker))
          }
        }).bind("127.0.0.1", 0).syncUninterruptibly().channel()
      port = (server.localAddress() as InetSocketAddress).port
    } catch (failure: Exception) { io.shutdownNow(); boss.shutdownGracefully(); workers.shutdownGracefully(); throw failure }
  }
  fun url(grant: HubResourceGrant): String = "http://127.0.0.1:$port/resource/${grant.id}"
  override fun close() {
    server.close()
    try { grants.close() } finally { io.shutdownNow(); boss.shutdownGracefully(); workers.shutdownGracefully() }
  }
}
