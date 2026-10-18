package expo.modules.healthconnect.network

import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.diagnostics.NativeTally
import java.io.IOException
import java.net.URI
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.OkHttpClient
import okhttp3.WebSocket

class HubLeaseFence {
  @Volatile private var active = true

  fun check() {
    if (!active) throw IOException("Hub transport trust was withdrawn")
  }

  fun withdraw() {
    active = false
    NativeLog.info("hub-transport", "fence.withdrawn")
  }
}

data class HubLease(
  val url: String,
  val client: OkHttpClient,
  val scopeId: String?,
  val fence: HubLeaseFence? = null,
  val current: (() -> Unit)? = null,
) {
  fun check() {
    fence?.check()
    current?.invoke()
  }
}

object HubTransport {
  private val eviction = Executors.newSingleThreadExecutor { task -> Thread(task, "hub-evict").apply { isDaemon = true } }
  private const val MAX_IDLE_CONNECTIONS = 5
  private const val KEEP_ALIVE_SECONDS = 5L
  private const val CONNECT_SECONDS = 15L
  private const val READ_SECONDS = 60L
  private const val SCOPE = "hub-transport"
  private val leases = NativeTally(SCOPE, "lease.summary")

  private class Policy(var trust: HubTrust) {
    val fence = HubLeaseFence()
    val dispatcher = Dispatcher()
    val pool = ConnectionPool(MAX_IDLE_CONNECTIONS, KEEP_ALIVE_SECONDS, TimeUnit.SECONDS)
    val client: OkHttpClient = normal.newBuilder()
      .dispatcher(dispatcher)
      .connectionPool(pool)
      .addInterceptor { chain ->
        fence.check()
        chain.proceed(chain.request())
      }
      .addNetworkInterceptor { chain ->
        fence.check()
        chain.proceed(chain.request())
      }
      .build()
  }

  private class Retired(val policy: Policy?, val sockets: Set<WebSocket>) {
    fun close() {
      val retired = policy ?: return
      retired.dispatcher.executorService.execute {
        try {
          sockets.forEach { it.cancel() }
          retired.dispatcher.cancelAll()
          retired.pool.evictAll()
        } finally {
          retired.dispatcher.executorService.shutdown()
        }
      }
    }
  }

  private val policies = mutableMapOf<String, Policy>()
  private val sockets = mutableMapOf<String, MutableSet<WebSocket>>()
  private val normal: OkHttpClient = HubPins.pinned(
    OkHttpClient.Builder()
      .retryOnConnectionFailure(false)
      .followRedirects(false)
      .followSslRedirects(false)
      .connectTimeout(CONNECT_SECONDS, TimeUnit.SECONDS)
      .readTimeout(READ_SECONDS, TimeUnit.SECONDS),
  ).build()

  fun configure(trust: HubTrust): Boolean {
    val retired = synchronized(this) {
      val old = policies[trust.scopeId]
      if (old?.trust == trust) {
        NativeLog.trace(SCOPE, "trust.unchanged") { mapOf("scope" to NativeLog.scopeLabel(trust.scopeId)) }
        return false
      }
      if (old != null && old.trust.sameHub(trust)) {
        old.trust = trust
        publish()
        NativeLog.info(SCOPE, "trust.updated") { trustFields(trust) + ("endpointsChanged" to true) }
        return false
      }
      val replaced = retire(trust.scopeId)
      policies[trust.scopeId] = Policy(trust)
      publish()
      NativeLog.info(SCOPE, "trust.configured") { trustFields(trust) + mapOf("replaced" to (old != null), "policies" to policies.size) }
      replaced
    }
    retired.close()
    return retired.policy != null
  }

  private fun trustFields(trust: HubTrust): Map<String, Any?> = mapOf(
    "scope" to NativeLog.scopeLabel(trust.scopeId),
    "hubId" to trust.hubId.take(8),
    "endpoints" to trust.inventory.map { it.kind },
    "addresses" to trust.addresses.size,
  )

  fun clear(scopeId: String) {
    synchronized(this) {
      val retired = retire(scopeId)
      publish()
      NativeLog.info(SCOPE, "trust.cleared") { mapOf("scope" to NativeLog.scopeLabel(scopeId), "hadPolicy" to (retired.policy != null), "sockets" to retired.sockets.size) }
      retired
    }.close()
  }

  private fun publish() {
    HubPins.update(policies.values.map { it.trust })
  }

  private fun retire(scopeId: String): Retired {
    val policy = policies.remove(scopeId)
    policy?.fence?.withdraw()
    return Retired(policy, sockets.remove(scopeId)?.toSet() ?: emptySet())
  }

  @Synchronized fun trackSocket(scopeId: String?, socket: WebSocket) {
    if (scopeId == null) return
    if (!policies.containsKey(scopeId)) {
      NativeLog.warn(SCOPE, "socket.refused") { mapOf("scope" to NativeLog.scopeLabel(scopeId), "reason" to "no_policy") }
      socket.cancel()
      return
    }
    val tracked = sockets.getOrPut(scopeId) { mutableSetOf() }
    tracked.add(socket)
    NativeLog.debug(SCOPE, "socket.tracked") { mapOf("scope" to NativeLog.scopeLabel(scopeId), "open" to tracked.size) }
  }

  @Synchronized fun releaseSocket(scopeId: String?, socket: WebSocket) {
    if (scopeId != null) {
      val removed = sockets[scopeId]?.remove(socket) == true
      NativeLog.debug(SCOPE, "socket.released") { mapOf("scope" to NativeLog.scopeLabel(scopeId), "wasTracked" to removed, "open" to (sockets[scopeId]?.size ?: 0)) }
    }
  }

  fun canonicalLease(input: String): HubLease {
    canonicalOrigin(input)
    return HubLease(input, normal, null)
  }

  fun evictIdle() {
    val pools = synchronized(this) { policies.values.map { it.pool } }
    NativeLog.info(SCOPE, "pool.evict_requested") { mapOf("pools" to pools.size, "connections" to pools.sumOf { it.connectionCount() }, "idle" to pools.sumOf { it.idleConnectionCount() }) }
    eviction.execute {
      val started = System.nanoTime()
      try {
        pools.forEach { it.evictAll() }
        HubPins.evictShared()
        NativeLog.debug(SCOPE, "pool.evicted", NativeLog.elapsedMs(started)) { mapOf("pools" to pools.size) }
      } catch (failure: Exception) {
        NativeLog.warn(SCOPE, "pool.evict_failed", failure, NativeLog.elapsedMs(started))
        throw failure
      }
    }
  }

  @Synchronized fun lease(input: String, scopeId: String? = null): HubLease {
    val uri = URI(input.replaceFirst("wss:", "https:").replaceFirst("ws:", "http:"))
    require(uri.userInfo == null && uri.fragment == null && uri.host != null)
    val origin = HubTrust.origin(uri)
    val matches = policies.values.filter { it.trust.endpoints.containsKey(origin) && (scopeId == null || it.trust.scopeId == scopeId) }
    if (matches.isEmpty()) {
      if (!(scopeId == null && uri.scheme == "https")) {
        NativeLog.warn(SCOPE, "lease.refused") { mapOf("reason" to "no_scoped_trust", "host" to NativeLog.hostOnly(input), "scope" to scopeId?.let(NativeLog::scopeLabel)) }
        throw IllegalArgumentException("Hub endpoint has no scoped trust")
      }
      NativeLog.debug(SCOPE, "lease.unscoped") { mapOf("host" to NativeLog.hostOnly(input)) }
      return HubLease(input, normal, null)
    }
    val policy = matches.first()
    leases.add(0)
    return HubLease(input, policy.client, policy.trust.scopeId, policy.fence)
  }
}
