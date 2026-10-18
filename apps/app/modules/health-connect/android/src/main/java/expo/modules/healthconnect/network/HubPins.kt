package expo.modules.healthconnect.network

import expo.modules.healthconnect.diagnostics.NativeLog
import java.io.IOException
import java.net.InetAddress
import java.net.Proxy
import java.net.ProxySelector
import java.net.SocketAddress
import java.net.URI
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSession
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager
import okhttp3.Dns
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.internal.tls.OkHostnameVerifier

internal class HubPinSet(trusts: Collection<HubTrust>) {
  private val keys = trusts.map { it.hubId }.toSet()
  private val hosts = trusts.flatMap { trust -> trust.inventory.map { host(it.url) } + trust.serverName }.toSet()
  private val local = trusts.flatMap { trust ->
    trust.inventory.filter { it.kind != "remote" }.map { host(it.url) } + trust.serverName
  }.toSet()
  private val named = trusts.filter { it.addresses.isNotEmpty() }
    .groupBy({ it.serverName }, { it.addresses })
    .mapValues { entry -> entry.value.flatten().distinctBy { it.hostAddress } }

  fun accepts(certificate: X509Certificate): Boolean = acceptsKey(certificate.publicKey.encoded)

  fun acceptsKey(encoded: ByteArray): Boolean = keyHash(encoded) in keys

  fun isHub(host: String): Boolean = normalize(host) in hosts

  fun isLocal(host: String): Boolean = normalize(host) in local

  fun resolve(host: String): List<InetAddress>? = named[host.lowercase()]

  companion object {
    fun keyHash(encoded: ByteArray): String =
      MessageDigest.getInstance("SHA-256").digest(encoded).joinToString("") { "%02x".format(it.toInt() and 255) }

    fun normalize(host: String): String {
      val bare = host.removePrefix("[").removeSuffix("]").lowercase()
      return if (bare.contains(':')) InetAddress.getByName(bare).hostAddress.orEmpty() else bare
    }

    private fun host(url: String): String = normalize(URI(url).host)
  }
}

object HubPins {
  @Volatile private var pins = HubPinSet(emptyList())
  private var shared: OkHttpClient? = null

  fun update(trusts: Collection<HubTrust>) {
    pins = HubPinSet(trusts)
    NativeLog.info("hub-tls", "pins.updated") { mapOf("hubs" to trusts.map { it.hubId.take(8) }, "scopes" to trusts.size) }
  }

  @Synchronized fun evictShared() {
    shared?.connectionPool?.evictAll()
  }

  @Synchronized fun sharedClient(newBuilder: () -> OkHttpClient.Builder): OkHttpClient =
    shared ?: pinned(newBuilder()).build().also { shared = it }

  fun pinned(builder: OkHttpClient.Builder): OkHttpClient.Builder {
    val trust = PinnedTrust({ pins }, platformTrust())
    val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
    return builder
      .sslSocketFactory(context.socketFactory, trust)
      .hostnameVerifier(PinnedHostnames { pins })
      .dns(PinnedDns { pins })
      .proxySelector(LocalDirect { pins })
      .addNetworkInterceptor(Interceptor { chain -> refuseRedirect(pins, chain) })
  }

  private fun refuseRedirect(pins: HubPinSet, chain: Interceptor.Chain): okhttp3.Response {
    val response = chain.proceed(chain.request())
    if (response.isRedirect && pins.isHub(chain.request().url.host)) {
      NativeLog.warn("hub-tls", "redirect.refused") { mapOf("status" to response.code, "host" to chain.request().url.host) }
      response.close()
      throw IOException("Hub redirects are forbidden")
    }
    return response
  }

  private fun platformTrust(): X509TrustManager {
    val factory = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
    val store: KeyStore? = null
    factory.init(store)
    return factory.trustManagers.filterIsInstance<X509TrustManager>().first()
  }
}

private class PinnedTrust(private val pins: () -> HubPinSet, private val platform: X509TrustManager) : X509TrustManager {
  override fun getAcceptedIssuers(): Array<X509Certificate> = platform.acceptedIssuers

  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
    platform.checkClientTrusted(chain, authType)
  }

  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    val leaf = chain.firstOrNull()
    if (leaf != null && pins().accepts(leaf)) {
      NativeLog.debug("hub-tls", "trust.pinned") { mapOf("chain" to chain.size, "key" to PinSet.short(leaf.publicKey.encoded), "authType" to authType) }
      return
    }
    try {
      platform.checkServerTrusted(chain, authType)
      NativeLog.debug("hub-tls", "trust.platform") { mapOf("chain" to chain.size, "key" to leaf?.let { PinSet.short(it.publicKey.encoded) }, "authType" to authType) }
    } catch (failure: java.security.cert.CertificateException) {
      NativeLog.warn("hub-tls", "trust.rejected", failure) { mapOf("chain" to chain.size, "key" to leaf?.let { PinSet.short(it.publicKey.encoded) }, "authType" to authType) }
      throw failure
    }
  }
}

private class PinnedHostnames(private val pins: () -> HubPinSet) : HostnameVerifier {
  override fun verify(host: String, session: SSLSession): Boolean {
    val leaf = session.peerCertificates.filterIsInstance<X509Certificate>().firstOrNull()
    if (leaf != null && pins().isHub(host) && pins().accepts(leaf)) {
      NativeLog.debug("hub-tls", "hostname.pinned") { mapOf("host" to host, "protocol" to session.protocol, "cipher" to session.cipherSuite) }
      return true
    }
    val verified = OkHostnameVerifier.verify(host, session)
    NativeLog.debug("hub-tls", "hostname.fallback") { mapOf("host" to host, "verified" to verified, "isHub" to (leaf != null && pins().isHub(host)), "protocol" to session.protocol) }
    return verified
  }
}

private class LocalDirect(private val pins: () -> HubPinSet) : ProxySelector() {
  override fun select(uri: URI?): List<Proxy> {
    val host = uri?.host
    if (host != null && pins().isLocal(host)) return listOf(Proxy.NO_PROXY)
    return ProxySelector.getDefault()?.select(uri) ?: listOf(Proxy.NO_PROXY)
  }

  override fun connectFailed(uri: URI?, address: SocketAddress?, failure: IOException?) {
    ProxySelector.getDefault()?.connectFailed(uri, address, failure)
  }
}

private class PinnedDns(private val pins: () -> HubPinSet) : Dns {
  override fun lookup(hostname: String): List<InetAddress> {
    val pinned = pins().resolve(hostname)
    val started = System.nanoTime()
    return try {
      (pinned ?: Dns.SYSTEM.lookup(hostname)).also {
        NativeLog.debug("hub-tls", "dns.resolved", NativeLog.elapsedMs(started)) { mapOf("host" to hostname, "pinned" to (pinned != null), "addresses" to it.size) }
      }
    } catch (failure: java.net.UnknownHostException) {
      NativeLog.warn("hub-tls", "dns.failed", failure, NativeLog.elapsedMs(started)) { mapOf("host" to hostname) }
      throw failure
    }
  }
}

private object PinSet {
  fun short(encoded: ByteArray): String = HubPinSet.keyHash(encoded).take(8)
}
