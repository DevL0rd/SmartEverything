package expo.modules.healthconnect.network

import java.net.InetSocketAddress
import java.net.URI
import java.net.Socket
import android.os.SystemClock
import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.ScheduledFuture
import javax.net.ssl.SSLContext
import javax.net.ssl.SNIHostName
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager
import org.json.JSONObject

data class HubPairingSelection(val generation: Long, val url: String, val hubId: String?, val current: () -> Boolean)
private class PairingCertificateObserved : CertificateException("Pairing certificate observed; handshake rejected")
private class PairingInspectionTrust(private val expected: String?) : X509TrustManager {
  var observation: Map<String, Any?>? = null
    private set
  private val rejection = PairingCertificateObserved()
  override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {
    throw CertificateException("Pairing inspection does not accept client certificates")
  }
  override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {
    require(chain.size in 1..4) { "Pairing certificate chain exceeds its bound" }
    require(chain.all { it.encoded.size <= CERTIFICATE_MAX_BYTES }) { "Pairing certificate exceeds its bound" }
    val leaf = chain.first()
    leaf.checkValidity()
    val names = leaf.subjectAlternativeNames ?: throw CertificateException("Pairing certificate has no SAN")
    require(names.size <= 32) { "Pairing certificate SAN list exceeds its bound" }
    val canonical = names.filter { it.size == 2 && it[0] == 2 && it[1] is String && NAME.matches(it[1].toString()) }
    require(canonical.size == 1) { "Pairing certificate requires one exact canonical DNS SAN" }
    val name = canonical.first()[1].toString()
    require(NAME.matches(name) && (expected == null || expected == name)) { "Pairing certificate has an unexpected SAN" }
    observation = mapOf("tls" to mapOf("serverName" to name, "certificateSha256" to hash(leaf.encoded),
      "publicKeySha256" to hash(leaf.publicKey.encoded)), "validFrom" to leaf.notBefore.toInstant().toString(),
      "validTo" to leaf.notAfter.toInstant().toString())
    throw rejection
  }
  fun isObserved(failure: Throwable): Boolean = generateSequence(failure) { it.cause }.take(16).any { it === rejection }
  private fun hash(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes)
    .joinToString("") { "%02x".format(it.toInt() and 255) }
  companion object {
    private const val CERTIFICATE_MAX_BYTES = 16 * 1024
    private val NAME = Regex("smarteverything-[0-9a-f]{32}\\.local")
  }
}
class HubPairingInspection : AutoCloseable {
  private data class Pending(val id: String, val socket: Socket, val selected: HubPairingSelection) {
    val startedAt = SystemClock.elapsedRealtime()
    @Volatile var cancelled = false
    fun cancel() { cancelled = true; socket.close() }
  }
  private val deadlines = Executors.newSingleThreadScheduledExecutor()
  private var pending: Pending? = null
  private val cancelledRequests = mutableSetOf<String>()
  private var closed = false
  fun inspect(json: String, select: (JSONObject) -> HubPairingSelection): Map<String, Any?> {
    val input = parse(json)
    val selected = select(input)
    val uri = URI(selected.url)
    val address = uri.host.removePrefix("[").removeSuffix("]")
    val literal = HubTrust.literal(address)
    val port = if (uri.port == -1) 443 else uri.port
    val operation = Pending(input.getString("requestId"), Socket(), selected)
    synchronized(this) {
      check(!closed && pending == null) { "Only one pairing inspection may run" }
      check(!cancelledRequests.remove(operation.id)) { "Pairing inspection was cancelled before starting" }
      pending = operation
    }
    var deadline: ScheduledFuture<*>? = null
    try {
      deadline = deadlines.schedule({ operation.cancel() }, DEADLINE_MS, TimeUnit.MILLISECONDS)
      return handshake(input, operation, literal, address, port)
    } finally {
      deadline?.cancel(false)
      operation.socket.close()
      synchronized(this) { if (pending === operation) pending = null }
    }
  }
  private fun handshake(input: JSONObject, operation: Pending, literal: java.net.InetAddress, address: String, port: Int): Map<String, Any?> {
    val name = if (input.has("serverName")) input.getString("serverName") else null
    val trust = PairingInspectionTrust(name)
    val context = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trust), null) }
    operation.socket.connect(InetSocketAddress(literal, port), DEADLINE_MS.toInt())
    context.socketFactory.createSocket(operation.socket, address, port, true).use { socket ->
      require(socket is SSLSocket)
      socket.soTimeout = DEADLINE_MS.toInt()
      socket.useClientMode = true
      if (name != null) socket.sslParameters = socket.sslParameters.apply { serverNames = listOf(SNIHostName(name)) }
      try { socket.startHandshake(); error("Pairing inspection unexpectedly accepted a TLS channel") }
      catch (failure: Exception) {
        if (!trust.isObserved(failure)) throw failure
        check(!operation.cancelled && SystemClock.elapsedRealtime() - operation.startedAt < DEADLINE_MS && operation.selected.current()) { "Pairing candidate was withdrawn or exceeded its deadline" }
        val observed = trust.observation ?: error("Pairing inspection has no observation")
        val tls = observed["tls"]
        require(tls is Map<*, *>)
        val id = operation.selected.hubId
        require(id == null || id == tls["publicKeySha256"]) { "Pairing candidate identity changed" }
        return observed + mapOf("kind" to "observed", "requestId" to operation.id, "generation" to operation.selected.generation,
          "url" to operation.selected.url, "address" to address, "port" to port)
      }
    }
  }
  private fun parse(json: String): JSONObject {
    require(json.length <= 2048)
    val input = JSONObject(json)
    require(input.keys().asSequence().all { it in setOf("requestId", "generation", "url", "serverName") })
    require(input.get("requestId") is String && input.get("url") is String)
    val generation = input.get("generation")
    require(generation is Number && generation.toDouble() == generation.toLong().toDouble() && generation.toLong() in 0..9_007_199_254_740_991L)
    require(input.getString("requestId").length in 1..100)
    val uri = URI(input.getString("url"))
    require(uri.scheme == "https" && uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null)
    require((uri.path == null || uri.path.isEmpty()) && (uri.port == -1 || uri.port in 1..65535))
    HubTrust.literal(uri.host.removePrefix("[").removeSuffix("]"))
    if (input.has("serverName")) require(Regex("smarteverything-[0-9a-f]{32}\\.local").matches(input.getString("serverName")))
    return input
  }
  @Synchronized fun cancel(id: String) {
    require(id.length in 1..100)
    if (pending?.id == id) pending?.cancel()
    else {
      check(cancelledRequests.size < 64 || cancelledRequests.contains(id)) { "Pairing cancellation capacity exceeded" }
      cancelledRequests.add(id)
    }
  }
  @Synchronized fun invalidate() { pending?.cancel() }
  @Synchronized fun reconcile() { if (pending?.selected?.current() == false) pending?.cancel() }
  @Synchronized override fun close() { closed = true; pending?.cancel(); cancelledRequests.clear(); deadlines.shutdownNow() }
  companion object { private const val DEADLINE_MS = 4000L }
}
