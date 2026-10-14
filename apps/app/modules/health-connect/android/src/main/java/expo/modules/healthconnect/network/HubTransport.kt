package expo.modules.healthconnect.network

import java.io.IOException
import java.net.URI
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLEngine
import javax.net.ssl.X509TrustManager
import okhttp3.ConnectionPool
import okhttp3.Dispatcher
import okhttp3.Dns
import okhttp3.OkHttpClient
import okhttp3.HttpUrl.Companion.toHttpUrl

class HubLeaseFence {
  @Volatile private var active = true
  fun check() { if (!active) throw IOException("Hub transport trust was withdrawn") }
  fun withdraw() { active = false }
}
data class HubLease(val url: String, val client: OkHttpClient, val scopeId: String?, val fence: HubLeaseFence? = null, val tls: SSLContext? = null, val current: (() -> Unit)? = null, val routeGeneration: Long? = null) {
  fun check() { fence?.check(); current?.invoke() }
  fun sslEngine(): SSLEngine {
    check()
    val uri = URI(url)
    return (tls ?: SSLContext.getDefault()).createSSLEngine(uri.host, if (uri.port == -1) 443 else uri.port).apply {
      useClientMode = true
      sslParameters = sslParameters.apply {
        endpointIdentificationAlgorithm = "HTTPS"
        if (!uri.host.contains(':') && !Regex("[0-9.]+").matches(uri.host)) serverNames = listOf(javax.net.ssl.SNIHostName(uri.host))
      }
    }
  }
}
object HubTransport {
  private data class Policy(val trust: HubTrust, val fence: HubLeaseFence, val dispatcher: Dispatcher = Dispatcher(), val pool: ConnectionPool = ConnectionPool())
  private data class Client(val http: OkHttpClient, val tls: SSLContext?)
  private val policies = mutableMapOf<String, Policy>()
  private val sockets = mutableMapOf<String, MutableSet<okhttp3.WebSocket>>()
  private val active = mutableMapOf<String, MutableMap<String, Client>>()
  private val normal = OkHttpClient.Builder().retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false)
    .connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build()

  fun configure(json: String): Boolean {
    val trust = HubTrust.parse(json)
    val retired = synchronized(this) {
      require(policies.values.none { it.trust.scopeId != trust.scopeId && it.trust.serverName == trust.serverName &&
        (it.trust.hubId != trust.hubId || it.trust.certificateSha256 != trust.certificateSha256) }) { "Conflicting same-host hub trust" }
      if (policies[trust.scopeId]?.trust == trust) return false
      val old = retire(trust.scopeId)
      policies[trust.scopeId] = Policy(trust, HubLeaseFence())
      old
    }
    retired.close()
    return true
  }
  fun clear(scopeId: String) { synchronized(this) { retire(scopeId) }.close() }
  private data class Retired(val policy: Policy?, val sockets: Set<okhttp3.WebSocket>) {
    fun close() {
      sockets.forEach { it.cancel() }
      policy?.dispatcher?.cancelAll()
      policy?.pool?.evictAll()
      policy?.dispatcher?.executorService?.shutdown()
    }
  }
  private fun retire(scopeId: String): Retired {
    val policy = policies.remove(scopeId)
    policy?.fence?.withdraw()
    active.remove(scopeId)
    return Retired(policy, sockets.remove(scopeId)?.toSet() ?: emptySet())
  }
  @Synchronized fun trackSocket(scopeId: String?, socket: okhttp3.WebSocket) {
    if (scopeId != null) {
      if (!policies.containsKey(scopeId)) { socket.cancel(); return }
      sockets.getOrPut(scopeId) { mutableSetOf() }.add(socket)
    }
  }
  @Synchronized fun releaseSocket(scopeId: String?, socket: okhttp3.WebSocket) {
    if (scopeId != null) sockets[scopeId]?.remove(socket)
  }
  fun canonicalLease(input: String): HubLease {
    canonicalOrigin(input)
    return HubLease(input, normal, null)
  }
  @Synchronized fun lease(input: String, scopeId: String? = null): HubLease {
    val uri = URI(input.replaceFirst("wss:", "https:").replaceFirst("ws:", "http:"))
    require(uri.userInfo == null && uri.fragment == null && uri.host != null)
    val origin = HubTrust.origin(uri)
    val matches = policies.values.filter { it.trust.endpoints.containsKey(origin) && (scopeId == null || it.trust.scopeId == scopeId) }
    if (matches.isEmpty()) {
      require(scopeId == null && uri.scheme == "https" && !uri.host.endsWith(".local")) { "Hub endpoint has no scoped trust" }
      return HubLease(input, normal, null)
    }
    require(matches.map { Triple(it.trust.hubId, it.trust.certificateSha256, it.trust.publicKeySha256) }.distinct().size == 1) {
      "Ambiguous hub trust; supply scopeId"
    }
    val policy = matches.first()
    val trust = policy.trust
    val cached = active[trust.scopeId]?.get(origin) ?: client(policy, uri, origin).also {
      active.getOrPut(trust.scopeId) { mutableMapOf() }[origin] = it
    }
    return HubLease(logicalUrl(input, uri, trust, origin), cached.http, trust.scopeId, policy.fence, cached.tls)
  }
  private fun client(policy: Policy, uri: URI, origin: String): Client {
    val trust = policy.trust
    val builder = normal.newBuilder().dispatcher(policy.dispatcher).connectionPool(policy.pool)
      .addInterceptor { chain -> policy.fence.check(); chain.proceed(chain.request()) }
      .addNetworkInterceptor { chain -> policy.fence.check(); chain.proceed(chain.request()) }
    if (trust.endpoints[origin] != "remote") builder.proxy(java.net.Proxy.NO_PROXY)
    if (trust.endpoints[origin] != "lan") return Client(builder.build(), null)
    val manager = PinTrust(trust, policy.fence)
    val socketTls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(manager), null) }
    val engineTls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(manager), null) }
    val literal = uri.host.removePrefix("[").removeSuffix("]")
    val addresses = if (literal == trust.serverName) trust.addresses else {
      val requested = HubTrust.literal(literal)
      trust.addresses.filter { it.address.contentEquals(requested.address) }
    }
    require(addresses.isNotEmpty()) { "LAN endpoint has no scoped address" }
    builder.sslSocketFactory(socketTls.socketFactory, manager).dns(object : Dns {
      override fun lookup(hostname: String): List<java.net.InetAddress> {
        policy.fence.check()
        return if (hostname == trust.serverName) addresses else Dns.SYSTEM.lookup(hostname)
      }
    })
    return Client(builder.build(), engineTls)
  }
  private fun logicalUrl(input: String, uri: URI, trust: HubTrust, origin: String): String {
    if (trust.endpoints[origin] != "lan") return input
    val logical = uri.toASCIIString().toHttpUrl().newBuilder().host(trust.serverName).build().toString()
    return if (input.startsWith("wss:")) logical.replaceFirst("https:", "wss:") else logical
  }
}
private class PinTrust(private val trust: HubTrust, private val fence: HubLeaseFence) : X509TrustManager {
  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
    throw CertificateException("Hub transport does not accept client certificates")
  }
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    fence.check()
    val certificate = chain.firstOrNull() ?: throw CertificateException("Missing hub certificate")
    certificate.checkValidity()
    val dnsNames = certificate.subjectAlternativeNames?.filter { it[0] == 2 }?.map { it[1] } ?: emptyList<Any>()
    if (!dnsNames.contains(trust.serverName)) throw CertificateException("Hub certificate requires the enrolled DNS SAN")
    if (hash(certificate.encoded) != trust.certificateSha256 || hash(certificate.publicKey.encoded) != trust.publicKeySha256)
      throw CertificateException("Hub certificate identity does not match enrolled pins")
  }
  private fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it.toInt() and 255) }
}
