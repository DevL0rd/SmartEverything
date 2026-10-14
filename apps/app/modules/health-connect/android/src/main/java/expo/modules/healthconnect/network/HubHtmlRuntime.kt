package expo.modules.healthconnect.network

import android.content.Context
import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.ChannelOption
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.SocketChannel
import io.netty.channel.socket.nio.NioServerSocketChannel

object HubHtmlRuntime {
  private data class Groups(val boss: NioEventLoopGroup, val workers: NioEventLoopGroup, var owners: Int)
  private var groups: Groups? = null
  private const val FIRST_PORT = 49152
  private const val PORT_COUNT = 16384
  private const val MAX_IDENTITIES = 1024
  private const val MAX_ATTEMPTS = 32
  @Synchronized fun open(context: Context, id: String, initializer: ChannelInitializer<SocketChannel>): Channel {
    require(Regex("[0-9a-f]{64}").matches(id))
    val preferences = context.applicationContext.getSharedPreferences("expo.modules.healthconnect.page-origins", Context.MODE_PRIVATE)
    val reserved = preferences.all
    require(reserved.size <= MAX_IDENTITIES && reserved.keys.all { Regex("[0-9a-f]{64}").matches(it) })
    require(reserved.values.all { it is Int && it in FIRST_PORT until FIRST_PORT + PORT_COUNT })
    val saved = preferences.getInt(id, 0)
    check(saved != 0 || reserved.size < MAX_IDENTITIES) { "Native page origin registry is full" }
    val owned = groups ?: Groups(NioEventLoopGroup(1), NioEventLoopGroup(1), 0).also { groups = it }
    try {
      val server = bind(owned, initializer, id, saved, reserved.values.toSet())
      val address = requireNotNull(java.net.InetSocketAddress::class.java.cast(server.localAddress())) { "Native page listener has no loopback address" }
      if (saved == 0 && !preferences.edit().putInt(id, address.port).commit()) {
        server.close().syncUninterruptibly()
        error("Native page origin could not be persisted")
      }
      owned.owners += 1
      return server
    } catch (failure: Exception) {
      if (owned.owners == 0) retire(owned)
      throw failure
    }
  }
  private fun bind(groups: Groups, initializer: ChannelInitializer<SocketChannel>, id: String, saved: Int, reserved: Set<Any?>): Channel {
    if (saved != 0) return listener(groups, initializer, saved)
    val start = id.take(8).toLong(16).rem(PORT_COUNT).toInt()
    var occupied: Exception? = null
    var attempts = 0
    for (offset in 0 until PORT_COUNT) {
      val candidate = FIRST_PORT + (start + offset) % PORT_COUNT
      if (candidate in reserved) continue
      try { return listener(groups, initializer, candidate) }
      catch (failure: java.net.BindException) { occupied = failure; attempts += 1; if (attempts >= MAX_ATTEMPTS) break }
    }
    throw java.io.IOException("Native page origin has no available reserved port", occupied)
  }
  private fun listener(groups: Groups, initializer: ChannelInitializer<SocketChannel>, port: Int): Channel =
    ServerBootstrap().group(groups.boss, groups.workers).channel(NioServerSocketChannel::class.java)
      .option(ChannelOption.SO_BACKLOG, 8).childOption(ChannelOption.AUTO_READ, true)
      .childHandler(initializer).bind("127.0.0.1", port).syncUninterruptibly().channel()
  @Synchronized fun release() {
    val owned = groups ?: error("Native page transport has no shared runtime")
    check(owned.owners > 0)
    owned.owners -= 1
    if (owned.owners == 0) retire(owned)
  }
  private fun retire(owned: Groups) {
    groups = null
    owned.boss.shutdownGracefully()
    owned.workers.shutdownGracefully()
  }
}
