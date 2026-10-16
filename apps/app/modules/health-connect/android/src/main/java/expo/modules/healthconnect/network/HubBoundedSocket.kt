package expo.modules.healthconnect.network

import io.netty.bootstrap.Bootstrap
import io.netty.buffer.Unpooled
import io.netty.buffer.UnpooledByteBufAllocator
import io.netty.channel.FixedRecvByteBufAllocator
import io.netty.resolver.NoopAddressResolverGroup
import io.netty.channel.Channel
import io.netty.channel.ChannelOption
import io.netty.channel.socket.nio.NioSocketChannel
import io.netty.handler.codec.http.websocketx.BinaryWebSocketFrame
import io.netty.handler.codec.http.websocketx.CloseWebSocketFrame
import io.netty.handler.codec.http.websocketx.PingWebSocketFrame
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame
import java.io.IOException
import java.net.InetSocketAddress
import java.net.URI
import java.net.Proxy
import java.util.concurrent.TimeUnit
import java.util.concurrent.ScheduledFuture
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

class HubBoundedSocket(private val lease: HubLease, private val original: Request, private val listener: WebSocketListener, private val pingSeconds: Long = 0) : WebSocket, HubSocketEvents {
  private data class Pending(val bytes: ByteArray, val binary: Boolean)
  private val pending = ArrayDeque<Pending>()
  private var queued = 0L
  @Volatile private var done = false
  private var open = false
  private var channel: Channel? = null
  private var group: io.netty.channel.nio.NioEventLoopGroup? = null
  private var heartbeatTask: ScheduledFuture<*>? = null
  private var awaitingPong = false
  private var deadline: ScheduledFuture<*>? = null
  fun start() {
    try {
      lease.check()
      val runtime = HubSocketRuntime.acquire()
      synchronized(this) {
        if (done) { HubSocketRuntime.release(runtime); return }
        group = runtime
        deadline = runtime.next().schedule({ failed(IOException("Hub socket opening timed out")) }, 15, TimeUnit.SECONDS)
      }
      lease.client.dispatcher.executorService.execute { prepare() }
    } catch (failure: Exception) { failed(failure) }
  }
  private fun prepare() {
    try {
      if (done) return
      lease.check()
      val uri = URI(lease.url)
      val targets = targets(uri)
      if (done) return
      lease.check()
      require(targets.isNotEmpty()) { "Hub endpoint did not resolve" }
      connect(targets, 0)
    } catch (failure: Exception) { failed(failure) }
  }
  private fun targets(uri: URI): List<Pair<InetSocketAddress, Proxy>> {
    val proxyUri = URI(lease.url.replaceFirst("wss:", "https:").replaceFirst("ws:", "http:"))
    val proxy = lease.client.proxy ?: lease.client.proxySelector.select(proxyUri).firstOrNull() ?: Proxy.NO_PROXY
    val port = if (uri.port == -1) if (uri.scheme == "http" || uri.scheme == "ws") 80 else 443 else uri.port
    if (proxy.type() == Proxy.Type.DIRECT) return lease.client.dns.lookup(uri.host).map { Pair(InetSocketAddress(it, port), proxy) }
    val address = proxy.address()
    require(address is InetSocketAddress) { "Hub proxy requires an internet socket address" }
    val hosts = if (address.isUnresolved) lease.client.dns.lookup(address.hostString) else listOf(address.address)
    val target = InetSocketAddress.createUnresolved(uri.host, port)
    return hosts.map { Pair(target, Proxy(proxy.type(), InetSocketAddress(it, address.port))) }
  }
  private fun connect(targets: List<Pair<InetSocketAddress, Proxy>>, index: Int) {
    if (done) return
    lease.check()
    val runtime = synchronized(this) { if (done) return; group ?: return }
    val future = Bootstrap().group(runtime).resolver(NoopAddressResolverGroup.INSTANCE).channel(NioSocketChannel::class.java)
      .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 15_000)
      .option(ChannelOption.TCP_NODELAY, true)
      .option(ChannelOption.ALLOCATOR, UnpooledByteBufAllocator.DEFAULT)
      .option(ChannelOption.RCVBUF_ALLOCATOR, FixedRecvByteBufAllocator(8192))
      .handler(HubSocketPipeline(lease, original, this, targets[index].second))
      .connect(targets[index].first)
    synchronized(this) { if (done) future.channel().close() else channel = future.channel() }
    future.addListener { result ->
      if (!result.isSuccess) {
        if (index + 1 < targets.size) connect(targets, index + 1)
        else failed(result.cause() ?: IOException("Hub connection failed"))
      }
    }
  }
  override fun request(): Request = original
  @Synchronized override fun queueSize(): Long = queued
  override fun send(text: String): Boolean {
    if (text.length > MAX_BYTES) return false
    return enqueue(text.toByteArray(Charsets.UTF_8), false)
  }
  override fun send(bytes: ByteString): Boolean {
    if (bytes.size > MAX_BYTES) return false
    return enqueue(bytes.toByteArray(), true)
  }
  @Synchronized private fun enqueue(bytes: ByteArray, binary: Boolean): Boolean {
    if (done || bytes.size > MAX_BYTES || queued + bytes.size > MAX_BYTES) return false
    lease.check()
    queued += bytes.size
    val message = Pending(bytes, binary)
    if (open) write(message) else pending.addLast(message)
    return true
  }
  private fun write(message: Pending) {
    val current = channel ?: return
    val buffer = Unpooled.wrappedBuffer(message.bytes)
    val frame = if (message.binary) BinaryWebSocketFrame(buffer) else TextWebSocketFrame(buffer)
    current.eventLoop().execute { current.writeAndFlush(frame).addListener { result ->
      synchronized(this) { queued = maxOf(0, queued - message.bytes.size) }
      if (!result.isSuccess) failed(result.cause() ?: IOException("Hub socket write failed"))
    } }
  }
  override fun opened(protocol: String) {
    val buffered = synchronized(this) {
      if (done) { channel?.close(); return }
      lease.check()
      open = true
      deadline?.cancel(false)
      deadline = null
      val runtime = group
      if (pingSeconds > 0 && runtime != null) heartbeatTask = runtime.next().scheduleAtFixedRate({ heartbeat() }, pingSeconds, pingSeconds, TimeUnit.SECONDS)
      pending.toList().also { pending.clear() }
    }
    val response = Response.Builder().request(original).protocol(Protocol.HTTP_1_1).code(101).message("Switching Protocols")
    if (protocol.isNotEmpty()) response.header("Sec-WebSocket-Protocol", protocol)
    buffered.forEach { if (!done) write(it) }
    if (!done) listener.onOpen(this, response.build())
  }
  override fun text(bytes: ByteArray) { if (!done) listener.onMessage(this, bytes.toString(Charsets.UTF_8)) }
  override fun binary(bytes: ByteArray) { if (!done) listener.onMessage(this, bytes.toByteString()) }
  override fun closing(code: Int, reason: String) {
    if (code == -1) { close(1000, ""); return }
    listener.onClosing(this, code, reason)
    close(code, reason)
  }
  override fun close(code: Int, reason: String?): Boolean {
    val message = reason ?: ""
    require(code in 1000..4999 && code !in listOf(1004, 1005, 1006, 1015) && message.toByteArray().size <= 123)
    return complete(code, message, null)
  }
  override fun cancel() { complete(1006, "Hub socket cancelled", IOException("Hub socket cancelled")) }
  override fun failed(cause: Throwable) { complete(1006, "Hub socket transport failed", cause) }
  override fun oversized() { complete(1009, "Hub message limit exceeded", null) }
  override fun inactive() { complete(1006, "Hub socket transport ended", IOException("Hub socket transport ended")) }
  @Synchronized override fun pong() { awaitingPong = false }
  private fun heartbeat() {
    val current = synchronized(this) {
      if (!open || done) return
      if (awaitingPong) null else channel.also { awaitingPong = true }
    }
    if (current == null) failed(IOException("Hub socket heartbeat timed out"))
    else current.writeAndFlush(PingWebSocketFrame()).addListener { result -> if (!result.isSuccess) failed(result.cause() ?: IOException("Hub socket heartbeat failed")) }
  }
  private fun complete(code: Int, reason: String, cause: Throwable?): Boolean {
    val resources = synchronized(this) {
      if (done) return false
      done = true
      deadline?.cancel(false)
      deadline = null
      heartbeatTask?.cancel(false)
      heartbeatTask = null
      pending.clear()
      queued = 0
      val owned = Pair(channel, group)
      group = null
      owned
    }
    val current = resources.first
    if (current != null && current.isActive && open && cause == null)
      current.writeAndFlush(CloseWebSocketFrame(code, reason)).addListener { current.close() }
    else current?.close()
    try {
      if (cause == null) listener.onClosed(this, code, reason) else listener.onFailure(this, cause, null)
    } finally {
      val runtime = resources.second
      if (runtime != null) HubSocketRuntime.release(runtime)
    }
    return true
  }
  companion object { private const val MAX_BYTES = HubSocketPipeline.MAX_BYTES }
}
