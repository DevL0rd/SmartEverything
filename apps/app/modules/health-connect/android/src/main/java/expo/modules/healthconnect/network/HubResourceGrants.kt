package expo.modules.healthconnect.network

import io.netty.channel.Channel
import java.io.File
import java.io.IOException
import java.net.URI
import java.security.SecureRandom
import java.time.Instant
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import okhttp3.Call
import org.json.JSONObject

data class HubResourceAuthorization(val url: String, val expiresAt: String, val lease: HubLease)
data class HubResourceIdentity(val binding: HubRouteBinding, val purpose: String,
  val origin: String, val path: String, val size: String?)

class HubResourceGrant(val id: String, val binding: HubRouteBinding,
  url: String, expiresAt: String, val purpose: String, lease: HubLease) {
  @Volatile private var authorization = HubResourceAuthorization(url, expiresAt, lease)
  val url: String get() = authorization.url
  val expiresAt: String get() = authorization.expiresAt
  val lease: HubLease get() = authorization.lease
  @Synchronized fun renewable(): Boolean = active && Instant.now() < Instant.parse(expiresAt)
  @Synchronized fun renew(next: HubResourceAuthorization): Boolean {
    if (!renewable()) return false
    if (Instant.parse(next.expiresAt) < Instant.parse(authorization.expiresAt)) return false
    authorization = next
    return true
  }
  fun admission(): HubResourceAuthorization {
    val captured = authorization
    checkActive(); captured.lease.check()
    return captured
  }

  private val calls = mutableSetOf<Call>()
  private val admissions = mutableMapOf<Call, HubResourceAuthorization>()
  private val channels = mutableSetOf<Channel>()
  private val files = mutableSetOf<File>()
  private val withdrawals = mutableMapOf<String, () -> Unit>()
  @Volatile var downloaded: HubResourceFile? = null
  private var active = true
  private var expiry: ScheduledFuture<*>? = null
  @Synchronized fun expire(task: ScheduledFuture<*>) {
    expiry?.cancel(false)
    if (active) expiry = task else task.cancel(false)
  }
  @Synchronized private fun checkActive() {
    if (!active || Instant.now() >= Instant.parse(expiresAt)) throw IOException("Hub resource grant expired or was withdrawn")
  }
  fun check() { checkActive(); lease.check() }
  fun track(call: Call) { track(call, admission()) }
  fun track(call: Call, captured: HubResourceAuthorization) {
    check(); captured.lease.check()
    synchronized(this) { checkActive(); calls.add(call); admissions[call] = captured }
  }
  fun check(call: Call) {
    val captured = synchronized(this) { admissions[call] } ?: throw IOException("Resource call is retired")
    check(); captured.lease.check()
  }
  @Synchronized fun untrack(call: Call) { calls.remove(call); admissions.remove(call) }
  fun checkFile(name: String) {
    check()
    val file = downloaded ?: throw IOException("Private resource file is retired")
    if (file.file.name != name) throw IOException("Private resource file is retired")
  }
  @Synchronized fun retireFile(file: HubResourceFile): List<File> {
    file.withdrawPermission?.invoke()
    file.withdrawalKey?.let { withdrawals.remove(it) }
    if (downloaded === file) downloaded = null
    if (file.file.delete() || !file.file.exists()) { files.remove(file.file); return emptyList() }
    return listOf(file.file)
  }
  fun track(channel: Channel) { check(); synchronized(this) { checkActive(); channels.add(channel) } }
  @Synchronized fun untrack(channel: Channel) { channels.remove(channel) }
  fun track(file: File) { check(); synchronized(this) { checkActive(); files.removeAll { !it.exists() }; files.add(file) } }
  fun onWithdraw(key: String, action: () -> Unit) { check(); synchronized(this) { checkActive(); withdrawals[key] = action } }
  @Synchronized fun revoke(): List<File> {
    active = false
    expiry?.cancel(false)
    calls.toList().forEach { it.cancel() }; calls.clear(); admissions.clear()
    channels.toList().forEach { it.close() }; channels.clear()
    withdrawals.values.forEach { it() }; withdrawals.clear()
    val incomplete = files.filter { !it.delete() && it.exists() }
    files.clear()
    return incomplete
  }
}

class HubResourceGrants(private val policy: HubRoutePolicy) : AutoCloseable {
  private val values = mutableMapOf<String, HubResourceGrant>()
  private val identities = mutableMapOf<HubResourceIdentity, String>()
  private val cleanup = mutableSetOf<File>()
  private val timers = ScheduledThreadPoolExecutor(1).apply { removeOnCancelPolicy = true }
  private val random = SecureRandom()
  private val subscription = policy.subscribe { state ->
    val candidates = synchronized(this) { values.values.filter { it.binding.scopeId == state.scopeId } }
    candidates.forEach { if (runCatching { it.check() }.isFailure) release(it.id) }
  }
  fun open(json: String): HubResourceGrant {
    cleanupFiles()
    val input = JSONObject(json)
    val binding = HubRouteBinding.parse(input.getJSONObject("binding"))
    require(binding.scopeId == input.getString("scopeId") && binding.credentialKind == "client")
    val url = input.getString("url")
    val uri = URI(url)
    require(url.length <= 4096 && uri.scheme == "https" && uri.userInfo == null && uri.fragment == null)
    require(HubTrust.origin(uri) == HubTrust.origin(URI(binding.canonicalOrigin)) && uri.rawPath.startsWith('/') && uri.rawQuery != null)
    val expiresAt = input.getString("expiresAt")
    val expiry = Instant.parse(expiresAt)
    require(expiry > Instant.now())
    val purpose = input.getString("purpose")
    require(purpose in listOf("image", "audio", "recording", "attachment"))
    val lease = policy.lease(binding, url)
    val leasedUri = URI(lease.url)
    require(leasedUri.rawPath == uri.rawPath && leasedUri.rawQuery == uri.rawQuery) { "Signed resource encoding changed" }
    lease.check()
    val encoded = okhttp3.Request.Builder().url(lease.url).get().build().url
    require(encoded.encodedPath == uri.rawPath && encoded.encodedQuery == uri.rawQuery) { "Signed resource encoding changed" }
    val identity = HubResourceIdentity(binding, purpose, HubTrust.origin(uri), uri.rawPath, representation(uri))
    val grant = synchronized(this) { issue(identity, HubResourceAuthorization(url, expiresAt, lease)) }
    try { grant.check() } catch (failure: Exception) { release(grant.id); throw failure }
    return grant
  }
  private fun representation(uri: URI): String? = uri.rawQuery.split('&').map { it.split('=', limit = 2) }
    .firstOrNull { java.net.URLDecoder.decode(it[0], "UTF-8") == "size" }
    ?.let { java.net.URLDecoder.decode(if (it.size == 2) it[1] else "", "UTF-8") }
  private fun issue(identity: HubResourceIdentity, input: HubResourceAuthorization): HubResourceGrant {
    val old = identities[identity]?.let { values.getValue(it) }
    if (old != null && old.renewable()) {
      if (old.renew(input)) schedule(old)
      if (old.renewable()) return old
    }
    if (old != null) release(old.id)
    val id = ByteArray(32).also(random::nextBytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    val grant = HubResourceGrant(id, identity.binding, input.url, input.expiresAt, identity.purpose, input.lease)
    values[id] = grant
    identities[identity] = id
    schedule(grant)
    return grant
  }
  private fun schedule(grant: HubResourceGrant) {
    val expiry = Instant.parse(grant.expiresAt).toEpochMilli()
    grant.expire(timers.schedule({
      synchronized(this) { if (Instant.parse(grant.expiresAt).toEpochMilli() <= System.currentTimeMillis()) release(grant.id) }
    }, maxOf(1, expiry - System.currentTimeMillis()), TimeUnit.MILLISECONDS))
  }
  fun get(id: String): HubResourceGrant {
    require(Regex("[0-9a-f]{64}").matches(id))
    val grant = synchronized(this) { values[id] } ?: throw IOException("Unknown hub resource grant")
    grant.check()
    return grant
  }
  fun release(id: String) {
    val retired = synchronized(this) {
      val removed = values.remove(id) ?: return
      identities.entries.removeAll { it.value == id }
      removed
    }
    val failed = retired.revoke()
    synchronized(this) { cleanup.addAll(failed) }
  }
  @Synchronized private fun cleanupFiles() {
    cleanup.removeAll { it.delete() || !it.exists() }
    if (cleanup.isNotEmpty()) throw IOException("Private resource cleanup failed")
  }
  fun clear(scope: String) {
    val ids = synchronized(this) { values.values.filter { it.binding.scopeId == scope }.map { it.id } }
    ids.forEach(::release)
  }
  fun retireFile(grant: HubResourceGrant, file: HubResourceFile) {
    val failed = grant.retireFile(file)
    synchronized(this) { cleanup.addAll(failed) }
  }
  fun failed(grant: HubResourceGrant, call: Call) {
    if (call.isCanceled() || runCatching { grant.check(call) }.isFailure) return
    policy.failed(grant.binding)
  }
  override fun close() {
    subscription.close()
    synchronized(this) { values.keys.toList() }.forEach(::release)
    timers.shutdownNow()
    cleanupFiles()
  }
}
