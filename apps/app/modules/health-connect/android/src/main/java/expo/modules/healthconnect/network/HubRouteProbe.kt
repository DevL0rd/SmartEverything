package expo.modules.healthconnect.network

import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import okhttp3.Call
import okhttp3.Request
import org.json.JSONObject

data class HubRouteEndpoint(val url: String, val kind: String) {
  fun snapshot(): Map<String, String> = mapOf("url" to url, "kind" to kind)
}

object HubRouteProbe {
  private val executor = Executors.newFixedThreadPool(MAX_PROBES)
  private val permits = Semaphore(MAX_PROBES)
  private val calls = mutableSetOf<Call>()
  @Volatile var settled: () -> Unit = {}
  fun batch(scopeId: String, trust: HubTrust, endpoints: List<HubRouteEndpoint>): HubRouteEndpoint? {
    val capacity = permits.availablePermits()
    val remote = endpoints.firstOrNull { it.kind == "remote" }
    val local = endpoints.filter { it.kind != "remote" }.take(maxOf(0, capacity - if (remote == null) 0 else 1))
    val candidates = local + if (remote == null || capacity == 0) emptyList() else listOf(remote)
    val deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(PROBE_MS)
    val results = candidates.mapNotNull { endpoint ->
      if (!permits.tryAcquire()) return@mapNotNull null
      val retired = AtomicBoolean(false)
      val future = executor.submit(Callable {
        try { verify(scopeId, endpoint, trust) }
        finally { permits.release(); if (retired.get()) settled() }
      })
      Triple(endpoint, future, retired)
    }
    return results.map { (endpoint, future, retired) ->
      val answer = try { future.get(maxOf(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS) }
        catch (failure: java.util.concurrent.TimeoutException) { retired.set(true); false }
      endpoint to answer
    }.firstOrNull { it.second }?.first
  }
  fun cancel() { synchronized(calls) { calls.toList() }.forEach { it.cancel() } }
  fun canonicalIdentity(origin: String): JSONObject {
    if (!permits.tryAcquire()) throw java.io.IOException("Previous identity probes are still settling")
    try { return read(HubTransport.canonicalLease(origin + IDENTITY_PATH)).getJSONObject("identity") }
    finally { permits.release() }
  }
  private fun verify(scopeId: String, endpoint: HubRouteEndpoint, trust: HubTrust): Boolean = try {
    val identity = read(HubTransport.lease(endpoint.url + IDENTITY_PATH, scopeId)).getJSONObject("identity")
    val tls = identity.getJSONObject("tls")
    identity.getString("id") == trust.hubId && identity.getInt("protocolVersion") == 1 &&
      tls.getString("serverName") == trust.serverName && tls.getString("certificateSha256") == trust.certificateSha256 &&
      tls.getString("publicKeySha256") == trust.publicKeySha256
  } catch (failure: Exception) { false }
  private fun read(lease: HubLease): JSONObject {
    val client = lease.client.newBuilder().callTimeout(PROBE_MS, TimeUnit.MILLISECONDS).build()
    val call = client.newCall(Request.Builder().url(lease.url).get().build())
    synchronized(calls) { calls.add(call) }
    try {
      call.execute().use { response ->
        if (response.code == 429 || response.code >= 500) throw expo.modules.healthconnect.IngestUnavailable("Hub identity probe returned HTTP ${response.code}")
        if (!response.isSuccessful) throw expo.modules.healthconnect.IngestRejected(response.code, "Canonical hub identity was refused")
        val source = response.body?.source() ?: throw org.json.JSONException("Hub identity probe requires a body")
        require(!source.request(MAX_IDENTITY_BYTES + 1)) { "Hub identity exceeds limit" }
        lease.check()
        val result = JSONObject(source.readUtf8())
        require(result.getString("service") == "smarteverything")
        return result
      }
    } finally { synchronized(calls) { calls.remove(call) } }
  }
  const val MAX_PROBES = 4
  private const val PROBE_MS = 4_000L
  private const val MAX_IDENTITY_BYTES = 64 * 1024L
  private const val IDENTITY_PATH = "/.well-known/smarteverything/identity"
}
