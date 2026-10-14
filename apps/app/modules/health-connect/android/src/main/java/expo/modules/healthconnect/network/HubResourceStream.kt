package expo.modules.healthconnect.network

import io.netty.buffer.Unpooled
import io.netty.channel.ChannelHandlerContext
import io.netty.handler.codec.http.*
import java.io.IOException
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Request
import okhttp3.Response

object HubResourceStream {
  private const val CHUNK_BYTES = 32768
  private val REQUEST_HEADERS = setOf("range", "if-range", "if-none-match", "if-modified-since", "if-match", "if-unmodified-since")
  private val RESPONSE_HEADERS = setOf("content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "cache-control", "expires", "content-disposition", "content-encoding", "vary")
  fun request(grant: HubResourceGrant, headers: HttpHeaders? = null): Call {
    val admission = grant.admission()
    val builder = Request.Builder().url(admission.lease.url).get().header("Accept-Encoding", "identity")
    headers?.names()?.filter { it.lowercase() in REQUEST_HEADERS }?.forEach { builder.header(it, headers.get(it)) }
    val request = builder.build()
    val original = java.net.URI(admission.url)
    require(request.url.encodedPath == original.rawPath && request.url.encodedQuery == original.rawQuery) { "Signed resource encoding changed" }
    val call = admission.lease.client.newBuilder().callTimeout(0, TimeUnit.SECONDS)
      .readTimeout(30, TimeUnit.SECONDS).build().newCall(request)
    grant.track(call, admission)
    return call
  }
  fun response(grant: HubResourceGrant, call: Call, grants: HubResourceGrants): Response {
    val response = try { call.execute() } catch (failure: IOException) { grants.failed(grant, call); throw failure }
    try { grant.check(call); require(response.code !in 300..399 || response.code == 304) { "Signed resource redirects are forbidden" }; return response }
    catch (failure: Exception) { response.close(); throw failure }
  }
  fun relay(grants: HubResourceGrants, grant: HubResourceGrant, call: Call, head: Boolean, context: ChannelHandlerContext) {
    try {
      response(grant, call, grants).use { response ->
        val message = DefaultHttpResponse(HttpVersion.HTTP_1_1, HttpResponseStatus.valueOf(response.code))
        response.headers.names().filter { it.lowercase() in RESPONSE_HEADERS }.forEach { message.headers().set(it, response.headers.values(it)) }
        message.headers().set(HttpHeaderNames.CONNECTION, "close").set("Referrer-Policy", "no-referrer")
        val bodyless = head || response.code in listOf(204, 205, 304)
        if (!bodyless && !message.headers().contains(HttpHeaderNames.CONTENT_LENGTH)) HttpUtil.setTransferEncodingChunked(message, true)
        write(grant, context, message)
        if (!bodyless) pump(grants, grant, call, response, context)
        else call.cancel()
        write(grant, context, LastHttpContent.EMPTY_LAST_CONTENT)
      }
    } catch (failure: IOException) { context.close() }
    catch (failure: Exception) { context.close() }
    finally { grant.untrack(call); context.close() }
  }
  private fun pump(grants: HubResourceGrants, grant: HubResourceGrant, call: Call, response: Response, context: ChannelHandlerContext) {
    val input = response.body?.byteStream() ?: return
    val bytes = ByteArray(CHUNK_BYTES)
    while (true) {
      grant.check(call)
      val count = try { input.read(bytes) } catch (failure: IOException) { grants.failed(grant, call); throw failure }
      if (count < 0) return
      grant.check(call)
      write(grant, context, DefaultHttpContent(Unpooled.wrappedBuffer(bytes.copyOf(count))))
    }
  }
  private fun write(grant: HubResourceGrant, context: ChannelHandlerContext, message: HttpObject) {
    try { grant.check() } catch (failure: Exception) { io.netty.util.ReferenceCountUtil.release(message); throw failure }
    if (!context.channel().isActive) { io.netty.util.ReferenceCountUtil.release(message); throw IOException("Resource consumer closed") }
    val future = context.writeAndFlush(message)
    if (!future.await(30, TimeUnit.SECONDS) || !future.isSuccess) throw IOException("Resource consumer could not accept streamed bytes", future.cause())
  }
}
