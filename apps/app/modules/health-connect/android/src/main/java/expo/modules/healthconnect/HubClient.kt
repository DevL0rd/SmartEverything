package expo.modules.healthconnect

import java.io.IOException
import java.io.OutputStream
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.network.HubLease
import expo.modules.healthconnect.network.HubRouteBinding
import expo.modules.healthconnect.network.HubRoutePolicy
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.MediaType.Companion.toMediaType
import java.util.concurrent.TimeUnit
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException
import org.json.JSONException

class HubAnswer(val status: Int, val text: String)

class HubClient(private val target: IngestTarget) {
  fun urlOf(path: String): URL {
    require(path.startsWith(API_PREFIX)) { "A hub path must be absolute and start with $API_PREFIX, got $path" }
    return URL(URL(target.endpoint), path)
  }

  suspend inline fun <reified R> get(path: String): R = decode(fetch("GET", path, null))

  suspend inline fun <reified B, reified R> post(path: String, body: B): R =
    decode(fetch("POST", path, HubJson.encode(body)))

  suspend inline fun <reified B> submit(path: String, body: B, replace: Boolean = false) {
    fetch(if (replace) "PUT" else "POST", path, HubJson.encode(body))
  }

  suspend fun download(path: String, sink: OutputStream): Long = withContext(Dispatchers.IO) {
    require(path.startsWith(MEDIA_PREFIX)) { "A hub media path must start with $MEDIA_PREFIX, got $path" }
    val url = URL(URL(target.endpoint), path)
    val binding = target.binding?.invoke() ?: error("HubClient requires an explicit native credential binding")
    val policy = target.policy?.invoke() ?: error("HubClient requires its native route authority")
    val lease = policy.lease(binding, url.toString())
    val request = Request.Builder().url(lease.url).header("Authorization", "Bearer ${target.token}").build()
    lease.client.newCall(request).execute().use { response ->
      if (response.code !in 200..299) throw IngestRejected(response.code, response.body?.string().orEmpty())
      val bytes = response.body?.byteStream()?.copyTo(sink) ?: throw IngestRejected(response.code, "the answer had no body")
      lease.check()
      bytes
    }
  }

  @PublishedApi
  internal suspend fun fetch(method: String, path: String, body: String?): HubAnswer = withContext(Dispatchers.IO) {
    exchange(urlOf(path), method, body?.toByteArray(Charsets.UTF_8))
  }

  @PublishedApi
  internal inline fun <reified R> decode(answer: HubAnswer): R = try {
    HubJson.decode(answer.text)
  } catch (failure: SerializationException) {
    throw IngestRejected(answer.status, "the answer is not what was expected: ${failure.message}", failure)
  }

  private fun exchange(url: URL, method: String, body: ByteArray?): HubAnswer {
    val started = System.nanoTime()
    try {
      val binding = target.binding?.invoke() ?: error("HubClient requires an explicit native credential binding")
      val policy = target.policy?.invoke() ?: error("HubClient requires its native route authority")
      val lease = policy.lease(binding, url.toString())
      val request = Request.Builder().url(lease.url).header("Authorization", "Bearer ${target.token}")
        .method(method, body?.toRequestBody("application/json".toMediaType())).build()
      return perform(binding, policy, lease, request, started)
    } catch (failure: IOException) {
      logFailure(method, url, "io", failure, started)
      throw IngestUnavailable("${failure.javaClass.simpleName}: ${failure.message}", failure)
    } catch (failure: JSONException) {
      logFailure(method, url, "metadata_unreadable", failure, started)
      throw IngestRejected(502, "Hub bootstrap metadata is unreadable: ${failure.message}")
    } catch (failure: java.net.URISyntaxException) {
      logFailure(method, url, "endpoint_malformed", failure, started)
      throw IngestRejected(502, "Hub bootstrap endpoint is malformed: ${failure.message}")
    } catch (failure: IllegalArgumentException) {
      logFailure(method, url, "trust_refused", failure, started)
      throw IngestRejected(502, "Hub credential or trust metadata was refused: ${failure.message}")
    }
  }

  private fun logFailure(method: String, url: URL, step: String, failure: Throwable, started: Long) {
    NativeLog.warn(SCOPE, "request.failed", failure, NativeLog.elapsedMs(started)) {
      mapOf("method" to method, "route" to NativeLog.template(url.path), "step" to step)
    }
  }

  private fun perform(binding: HubRouteBinding, policy: HubRoutePolicy, lease: HubLease, request: Request, started: Long): HubAnswer {
    try {
      lease.client.newBuilder().readTimeout(READ_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS).build()
        .newCall(request).execute().use { response ->
          NativeLog.debug(SCOPE, "request.answered", NativeLog.elapsedMs(started)) {
            mapOf(
              "method" to request.method,
              "route" to NativeLog.template(request.url.encodedPath),
              "status" to response.code,
              "protocol" to response.protocol.toString(),
              "scope" to NativeLog.scopeLabel(binding.scopeId),
              "bytes" to response.body?.contentLength(),
              "tls" to response.handshake?.tlsVersion?.javaName,
            )
          }
          val result = answer(response)
          lease.check()
          return result
        }
    } catch (failure: IOException) {
      if (!policy.bound(binding)) {
        NativeLog.warn(SCOPE, "request.withdrawn", failure) { mapOf("method" to request.method, "route" to NativeLog.template(request.url.encodedPath)) }
        throw NativeCredentialWithdrawn()
      }
      NativeLog.warn(SCOPE, "request.transport_failed", failure, NativeLog.elapsedMs(started)) {
        mapOf("method" to request.method, "route" to NativeLog.template(request.url.encodedPath), "scope" to NativeLog.scopeLabel(binding.scopeId), "action" to "route_failure_reported")
      }
      policy.failed(binding)
      throw failure
    }
  }

  private fun answer(connection: Response): HubAnswer {
    val status = connection.code
    val text = connection.body?.string().orEmpty()
    if (status == 429 || status >= 500) {
      throw IngestUnavailable("HTTP $status: $text")
    }
    if (status !in 200..299) {
      throw IngestRejected(status, text)
    }
    return HubAnswer(status, text)
  }

  private companion object {
    const val SCOPE = "hub-client"
    const val API_PREFIX = "/api/"
    const val MEDIA_PREFIX = "/media/"
    const val READ_TIMEOUT_MS = 60_000
  }
}
