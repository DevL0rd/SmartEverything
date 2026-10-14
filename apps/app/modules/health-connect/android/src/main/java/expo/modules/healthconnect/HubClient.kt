package expo.modules.healthconnect

import java.io.IOException
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
import org.json.JSONException
import org.json.JSONObject

class HubClient(private val target: IngestTarget) {
  fun urlOf(relative: String): URL = URL(URL(target.endpoint), relative)

  suspend fun get(relative: String): JSONObject = withContext(Dispatchers.IO) {
    exchange(urlOf(relative), "GET", null)
  }

  suspend fun post(relative: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
    exchange(urlOf(relative), "POST", body.toString().toByteArray(Charsets.UTF_8))
  }

  suspend fun put(relative: String, body: JSONObject): JSONObject = withContext(Dispatchers.IO) {
    exchange(urlOf(relative), "PUT", body.toString().toByteArray(Charsets.UTF_8))
  }

  private fun exchange(url: URL, method: String, body: ByteArray?): JSONObject {
    try {
      val binding = target.binding?.invoke() ?: error("HubClient requires an explicit native credential binding")
      val policy = target.policy?.invoke() ?: error("HubClient requires its native route authority")
      val lease = policy.lease(binding, url.toString())
      val request = Request.Builder().url(lease.url).header("Authorization", "Bearer ${target.token}")
        .method(method, body?.toRequestBody("application/json".toMediaType())).build()
      return perform(binding, policy, lease, request)
    } catch (failure: IOException) {
      throw IngestUnavailable("${failure.javaClass.simpleName}: ${failure.message}", failure)
    } catch (failure: JSONException) {
      throw IngestRejected(502, "Hub bootstrap metadata is unreadable: ${failure.message}")
    } catch (failure: java.net.URISyntaxException) {
      throw IngestRejected(502, "Hub bootstrap endpoint is malformed: ${failure.message}")
    } catch (failure: IllegalArgumentException) {
      throw IngestRejected(502, "Hub credential or trust metadata was refused: ${failure.message}")
    }
  }

  private fun perform(binding: HubRouteBinding, policy: HubRoutePolicy, lease: HubLease, request: Request): JSONObject {
    try {
      lease.client.newBuilder().readTimeout(READ_TIMEOUT_MS.toLong(), TimeUnit.MILLISECONDS).build()
        .newCall(request).execute().use { response ->
          val result = answer(response)
          lease.check()
          return result
        }
    } catch (failure: IOException) {
      if (!policy.bound(binding)) throw NativeCredentialWithdrawn()
      policy.failed(binding, lease.routeGeneration)
      throw failure
    }
  }

  private fun answer(connection: Response): JSONObject {
    val status = connection.code
    val text = connection.body?.string().orEmpty()
    if (status == 429 || status >= 500) {
      throw IngestUnavailable("HTTP $status: $text")
    }
    if (status !in 200..299) {
      throw IngestRejected(status, text)
    }
    try {
      return JSONObject(text)
    } catch (failure: JSONException) {
      throw IngestRejected(status, "the answer is not JSON: $text")
    }
  }

  private companion object {
    const val READ_TIMEOUT_MS = 60_000
  }
}
