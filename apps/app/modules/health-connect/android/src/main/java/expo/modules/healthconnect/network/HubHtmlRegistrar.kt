package expo.modules.healthconnect.network

import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import expo.modules.kotlin.functions.Coroutine
import java.security.SecureRandom
import java.util.concurrent.CompletableFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import okhttp3.Call

class HubHtmlRegistrar(private val policy: () -> HubRoutePolicy, private val enrollment: (HubRouteBinding) -> (() -> Unit), private val retired: (String) -> Unit) : AutoCloseable {
  private class Projection(val input: HubHtmlInput, val lease: HubLease, val call: Call, private val owner: () -> Unit) {
    @Volatile var broker: HubHtmlBroker? = null
    private val views = mutableSetOf<HubHtmlView>()
    @Volatile var active = true
    @Volatile var expiry: java.util.concurrent.ScheduledFuture<*>? = null
    @Synchronized fun install(value: HubHtmlBroker) { check(active); broker = value }
    @Synchronized fun arm(task: java.util.concurrent.ScheduledFuture<*>) { if (active) expiry = task else task.cancel(false) }
    @Synchronized fun close() { active = false; expiry?.cancel(false); call.cancel(); views.toList().forEach { it.retire() }; views.clear(); broker?.close(); broker = null }
    @Synchronized fun attach(view: HubHtmlView) { check(active); check(views.add(view)); }
    @Synchronized fun detach(view: HubHtmlView) { views.remove(view) }
    fun checkRoute() { check(active); lease.check() }
    fun check() { check(active); owner(); lease.check() }
  }
  private val values = mutableMapOf<String, Projection>()
  private val io = java.util.concurrent.ThreadPoolExecutor(0, 16, 30, TimeUnit.SECONDS, java.util.concurrent.SynchronousQueue())
  private val timers = ScheduledThreadPoolExecutor(1).apply { removeOnCancelPolicy = true }
  private val random = SecureRandom()
  private var subscription: AutoCloseable? = null
  private var closed = false
  private fun ready() {
    synchronized(this) { check(!closed); if (subscription != null) return }
    val started = policy().subscribe { state ->
      val candidates = synchronized(this) { values.entries.filter { it.value.input.binding.scopeId == state["scopeId"] }.map { it.key to it.value } }
      candidates.forEach { if (runCatching { it.second.checkRoute() }.isFailure) release(it.first) }
    }
    val keep = synchronized(this) {
      if (closed || subscription != null) false else { subscription = started; true }
    }
    if (!keep) started.close()
    synchronized(this) { check(!closed) }
  }
  fun register(builder: ModuleDefinitionBuilder) = with(builder) {
    Function("htmlReady") { ready(); true }
    Function("htmlProjectVersion") { ready(); if (HubBrowserPolicy.supported()) 1 else 0 }
    Function("htmlLifetimeVersion") { ready(); 2 }
    Function("htmlViewReady") { android.webkit.WebView.getCurrentWebViewPackage() != null }
    Function("htmlCurrent") { id: String -> current(id) }
    AsyncFunction("openHtml") Coroutine { json: String -> withContext(Dispatchers.IO) { open(json) } }
    AsyncFunction("releaseHtml") { id: String -> release(id) }
  }
  private fun open(json: String): Map<String, Any?> {
    ready()
    val input = HubHtmlInput.parse(json)
    if (input.claim.has("capability")) check(HubBrowserPolicy.supported()) { "Project previews require isolated WebView profiles" }
    val owner = enrollment(input.binding)
    owner()
    val (lease, call) = HubHtmlClaim.request(input, policy())
    val projection = Projection(input, lease, call, owner)
    val id = ByteArray(32).also(random::nextBytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    synchronized(this) { check(!closed && values.size < 16); values[id] = projection }
    val result = CompletableFuture<Map<String, Any?>>()
    val deadline = timers.schedule({ call.cancel(); result.completeExceptionally(java.io.IOException("HTML claim admission timed out")); release(id) }, 15, TimeUnit.SECONDS)
    try {
      io.execute {
        try {
          projection.check()
          HubHtmlClaim.read(call, input, lease) { document ->
            projection.check()
            val assets = if (document is HubHtmlProject) HubHtmlAssets(input, document, policy(), projection::check) else null
            val broker = try { HubHtmlBroker(id, document, projection::check, assets) } catch (failure: Exception) { assets?.close(); throw failure }
            try { projection.install(broker) } catch (failure: Exception) { broker.close(); throw failure }
            document.expiresAt?.let { expiry -> projection.arm(timers.schedule({ release(id) }, maxOf(1, java.time.Instant.parse(expiry).toEpochMilli() - System.currentTimeMillis()), TimeUnit.MILLISECONDS)) }
            deadline.cancel(false)
            val descriptor = mutableMapOf<String, Any?>("id" to id, "url" to broker.url(), "expiresAt" to document.expiresAt)
            if (document is HubHtmlProject) descriptor["project"] = true
            result.complete(descriptor)
          }
          result.completeExceptionally(java.io.IOException("HTML claim lifetime ended"))
        } catch (failure: Exception) {
          if (failure is java.io.IOException && !call.isCanceled() && runCatching { projection.check() }.isSuccess) policy().failed(input.binding, input.generation)
          result.completeExceptionally(failure)
        }
        finally { deadline.cancel(false); release(id) }
      }
      val admitted = result.get()
      projection.check()
      return admitted
    } catch (failure: Exception) { deadline.cancel(false); release(id); throw failure }
  }
  fun attach(view: HubHtmlView, json: String) {
    val input = org.json.JSONObject(json)
    require(input.length() == 2)
    val id = input.getString("projectionId")
    require(Regex("[0-9a-f]{64}").matches(id))
    val projection = synchronized(this) { values[id] } ?: error("HTML projection was retired")
    projection.check()
    val broker = projection.broker ?: error("HTML projection has no listener")
    val browserId = input.getString("browserId")
    require(browserId.length in 1..512)
    try {
      view.bind(browserId, broker.url(), if (broker.document is HubHtmlProject) broker.origin() else null, projection::check) { projection.detach(view) }
      projection.attach(view)
    } catch (failure: Exception) { view.retire(); projection.detach(view); throw failure }
  }
  fun current(id: String): Boolean {
    require(Regex("[0-9a-f]{64}").matches(id))
    val value = synchronized(this) { values[id] } ?: return false
    return runCatching { value.check(); value.broker != null }.getOrDefault(false)
  }
  fun release(id: String, notify: Boolean = true) { require(Regex("[0-9a-f]{64}").matches(id)); val projection = synchronized(this) { values.remove(id) } ?: return; projection.close(); if (notify) retired(id) }
  fun clear(scope: String) { synchronized(this) { values.filter { it.value.input.binding.scopeId == scope }.keys.toList() }.forEach(::release) }
  fun clearPrincipal(principal: String) {
    synchronized(this) { values.filter { it.value.input.binding.principalId == principal }.keys.toList() }.forEach(::release)
  }
  fun retainEnrollment(canonical: String, principal: String) {
    synchronized(this) { values.filter { it.value.input.binding.principalId != principal || it.value.input.binding.canonicalOrigin != canonical }.keys.toList() }.forEach(::release)
  }
  override fun close() {
    val ids = synchronized(this) { closed = true; values.keys.toList() }
    ids.forEach { release(it, false) }; subscription?.close(); subscription = null; timers.shutdownNow(); io.shutdownNow()
  }
}
