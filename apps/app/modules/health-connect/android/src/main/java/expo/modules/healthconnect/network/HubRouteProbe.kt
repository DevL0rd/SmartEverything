package expo.modules.healthconnect.network

import expo.modules.healthconnect.IngestRejected
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.IngestUnavailable
import java.util.concurrent.Callable
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import okhttp3.Call
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject

object HubRouteProbe {
  private const val PROBE_MS = 4_000L
  private const val IDENTITY_PATH = "/.well-known/smarteverything/identity"
  private val executor = Executors.newCachedThreadPool { task -> Thread(task, "smarteverything-hub-probe").apply { isDaemon = true } }
  private val calls = ConcurrentHashMap.newKeySet<Call>()

  fun select(scopeId: String, trust: HubTrust, endpoints: List<HubRouteEndpoint>): HubRouteEndpoint? {
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(PROBE_MS)
    val attempts = endpoints.map { endpoint -> endpoint to executor.submit(Callable { verify(scopeId, endpoint, trust) }) }
    return attempts.firstOrNull { (_, attempt) -> answered(attempt, deadline) }?.first
  }

  fun cancel() {
    calls.toList().forEach { it.cancel() }
  }

  fun identity(lease: HubLease): JSONObject = read(lease).getJSONObject("identity")

  fun identityUrl(origin: String): String = origin + IDENTITY_PATH

  private fun answered(attempt: Future<Boolean>, deadline: Long): Boolean = try {
    attempt.get(maxOf(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS)
  } catch (failure: TimeoutException) {
    attempt.cancel(true)
    NativeLog.debug("hub-probe", "endpoint.timeout") { mapOf("probeMs" to PROBE_MS) }
    false
  } catch (failure: ExecutionException) {
    false
  }

  private fun verify(scopeId: String, endpoint: HubRouteEndpoint, trust: HubTrust): Boolean {
    val started = System.nanoTime()
    return try {
      val identity = identity(HubTransport.lease(identityUrl(endpoint.url.trimEnd('/')), scopeId))
      val matched = identity.getString("id") == trust.hubId && identity.getJSONObject("tls").getString("serverName") == trust.serverName
      NativeLog.debug("hub-probe", "endpoint.answered", NativeLog.elapsedMs(started)) {
        mapOf("kind" to endpoint.kind, "host" to NativeLog.hostOnly(endpoint.url), "identityMatched" to matched, "scope" to NativeLog.scopeLabel(scopeId))
      }
      matched
    } catch (failure: Exception) {
      NativeLog.debug("hub-probe", "endpoint.failed", NativeLog.elapsedMs(started)) {
        mapOf(
          "kind" to endpoint.kind, "host" to NativeLog.hostOnly(endpoint.url), "scope" to NativeLog.scopeLabel(scopeId),
          "errorName" to failure.javaClass.simpleName, "errorMessage" to NativeLog.reasonText(failure.message.orEmpty()),
        )
      }
      false
    }
  }

  private fun read(lease: HubLease): JSONObject {
    val client = lease.client.newBuilder().retryOnConnectionFailure(true).callTimeout(PROBE_MS, TimeUnit.MILLISECONDS).build()
    val call = client.newCall(Request.Builder().url(lease.url).get().build())
    calls.add(call)
    try {
      call.execute().use { response ->
        if (response.code == 429 || response.code >= 500) throw IngestUnavailable("Hub identity probe returned HTTP ${response.code}")
        if (!response.isSuccessful) throw IngestRejected(response.code, "Canonical hub identity was refused")
        val body = response.body ?: throw JSONException("Hub identity probe requires a body")
        lease.check()
        val result = JSONObject(body.string())
        require(result.getString("service") == "smarteverything")
        return result
      }
    } finally {
      calls.remove(call)
    }
  }
}
