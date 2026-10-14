package expo.modules.healthconnect.network

import io.netty.channel.nio.NioEventLoopGroup
import java.util.concurrent.ThreadFactory
import java.util.concurrent.TimeUnit

object HubSocketRuntime {
  private var group: NioEventLoopGroup? = null
  private var leases = 0
  @Synchronized fun acquire(): NioEventLoopGroup {
    val current = group ?: NioEventLoopGroup(1, ThreadFactory { task ->
      Thread(task, "smarteverything-hub-ws").apply { isDaemon = true }
    }).also { group = it }
    leases += 1
    return current
  }
  @Synchronized fun release(current: NioEventLoopGroup) {
    if (group !== current) return
    leases -= 1
    if (leases == 0) {
      group = null
      current.shutdownGracefully(0, 100, TimeUnit.MILLISECONDS)
    }
  }
}
