package expo.modules.healthconnect.network

import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.channel.ChannelFutureListener
import io.netty.handler.codec.http.*
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Request
import okhttp3.Response

class HubHtmlAssets(private val input: HubHtmlInput, private val policy: HubRoutePolicy, private val check: () -> Unit) : AutoCloseable {
  private val calls = java.util.concurrent.ConcurrentHashMap.newKeySet<Call>()
  private val io = java.util.concurrent.ThreadPoolExecutor(0, 8, 30, TimeUnit.SECONDS, java.util.concurrent.SynchronousQueue())
  @Volatile private var closed = false
  fun serve(context: ChannelHandlerContext, method: String, path: String, range: String?) {
    io.execute { transfer(context, method, path, range) }
  }
  private fun transfer(context: ChannelHandlerContext, method: String, path: String, range: String?) {
    var call: Call? = null
    var sent = false
    try {
      check(!closed); check.invoke()
      val url = input.binding.canonicalOrigin + input.page.assetPrefix() + path
      val lease = policy.lease(input.binding, url)
      val request = Request.Builder().url(lease.url).method(method, null)
        .header("Authorization", input.authorization)
        .header("Accept-Encoding", "identity").apply { if (range != null) header("Range", range) }.build()
      val active = lease.client.newBuilder().followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build().newCall(request)
      call = active
      calls.add(active)
      context.channel().closeFuture().addListener { active.cancel() }
      check(!closed); lease.check(); check.invoke()
      active.execute().use { response ->
        lease.check(); check.invoke()
        val headers = responseHeaders(response)
        context.writeAndFlush(headers).syncUninterruptibly().also { check(it.isSuccess) }
        sent = true
        if (method != "HEAD") stream(context, response) { check(!closed); lease.check(); check.invoke() }
        context.writeAndFlush(LastHttpContent.EMPTY_LAST_CONTENT).addListener(ChannelFutureListener.CLOSE)
      }
    } catch (failure: Exception) {
      if (failure is java.io.IOException && call?.isCanceled() != true && !closed && runCatching(check).isSuccess)
        policy.failed(input.binding, null)
      if (sent) context.close() else unavailable(context)
    } finally { call?.let { calls.remove(it); it.cancel() } }
  }
  private fun responseHeaders(response: Response): HttpResponse {
    val location = response.header("Location")
    require(location == null || (location.startsWith(input.page.assetPrefix() + "/") && !location.startsWith(input.page.assetPrefix() + "//") && !location.contains('\\') && !location.contains('\r') && !location.contains('\n')))
    val result = DefaultHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(response.code))
    HEADERS.forEach { name -> response.header(name)?.let { result.headers().set(name, it) } }
    if (location != null) result.headers().set("Location", location.removePrefix(input.page.assetPrefix()))
    result.headers().set("Connection", "close")
    if (!result.headers().contains("Content-Length")) HttpUtil.setTransferEncodingChunked(result, true)
    return result
  }
  private fun stream(context: ChannelHandlerContext, response: Response, check: () -> Unit) {
    val body = response.body ?: error("Project asset response requires its stream")
    body.byteStream().use { source ->
      val buffer = ByteArray(32768)
      while (true) {
        check.invoke()
        val count = source.read(buffer)
        if (count < 0) return
        check.invoke()
        check(context.channel().isActive)
        context.writeAndFlush(DefaultHttpContent(Unpooled.copiedBuffer(buffer, 0, count)))
          .syncUninterruptibly().also { check(it.isSuccess) }
      }
    }
  }
  private fun unavailable(context: ChannelHandlerContext) {
    val response = DefaultFullHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.BAD_GATEWAY)
    response.headers().set("Content-Length", 0).set("Connection", "close")
    context.writeAndFlush(response).addListener(ChannelFutureListener.CLOSE)
  }
  override fun close() { closed = true; calls.toList().forEach { it.cancel() }; io.shutdownNow() }
  companion object {
    private val HEADERS = listOf("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Location", "Content-Security-Policy", "Cache-Control", "Referrer-Policy", "X-Content-Type-Options")
  }
}
