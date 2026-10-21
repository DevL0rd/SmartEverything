package expo.modules.healthconnect.network

import android.content.Context
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import expo.modules.kotlin.functions.Coroutine

class HubHtmlRegistrar(private val context: () -> Context, private val policy: () -> HubRoutePolicy, private val enrollment: (HubRouteBinding) -> (() -> Unit), private val retired: (String) -> Unit) : AutoCloseable {
  private class Projection(val input: HubHtmlInput, private val policy: HubRoutePolicy, private val owner: () -> Unit) {
    @Volatile var broker: HubHtmlBroker? = null
    private val views = mutableSetOf<HubHtmlView>()
    @Volatile var active = true
    @Synchronized fun install(value: HubHtmlBroker) { check(active); broker = value }
    @Synchronized fun close() { active = false; views.toList().forEach { it.retire() }; views.clear(); broker = null }
    @Synchronized fun attach(view: HubHtmlView) { check(active); check(views.add(view)) }
    @Synchronized fun detach(view: HubHtmlView) { views.remove(view) }
    fun check() { check(active); owner(); check(policy.bound(input.binding)) { "HTML page enrollment was withdrawn" } }
  }
  private class Alias(val input: HubHtmlInput) {
    val owners = java.util.concurrent.CopyOnWriteArraySet<Projection>()
    lateinit var broker: HubHtmlBroker
    fun check() { (owners.firstOrNull { it.active } ?: error("HTML page origin has no owner")).check() }
  }
  private val values = mutableMapOf<String, Projection>()
  private val aliases = mutableMapOf<String, Alias>()
  private val random = java.security.SecureRandom()
  private var subscription: AutoCloseable? = null
  private var closed = false
  private fun ready() {
    synchronized(this) { check(!closed); if (subscription != null) return }
    val started = policy().subscribe { state ->
      val candidates = synchronized(this) { values.entries.filter { it.value.input.binding.scopeId == state.scopeId }.map { it.key to it.value } }
      candidates.forEach { if (runCatching { it.second.check() }.isFailure) release(it.first) }
    }
    val keep = synchronized(this) { if (closed || subscription != null) false else { subscription = started; true } }
    if (!keep) started.close()
    synchronized(this) { check(!closed) }
  }
  fun register(builder: ModuleDefinitionBuilder) = with(builder) {
    Function("htmlReady") { ready(); true }
    Function("htmlViewReady") { android.webkit.WebView.getCurrentWebViewPackage() != null }
    Function("htmlCurrent") { id: String -> current(id) }
    AsyncFunction("openHtml") Coroutine { json: String -> withContext(Dispatchers.IO) { open(json) } }
    AsyncFunction("releaseHtml") { id: String -> release(id) }
  }
  private fun open(json: String): Map<String, Any?> {
    ready()
    val input = HubHtmlInput.parse(json)
    check(HubBrowserPolicy.supported()) { "Pages require isolated WebView profiles" }
    val owner = enrollment(input.binding)
    owner()
    val projection = Projection(input, policy(), owner)
    val id = ByteArray(32).also(random::nextBytes).joinToString("") { "%02x".format(it.toInt() and 255) }
    synchronized(this) {
      check(!closed) { "HTML page transport is closed" }
      values[id] = projection
    }
    try {
      projection.check()
      val broker = origin(projection)
      projection.install(broker)
      projection.check()
      return mapOf("id" to id, "url" to broker.origin() + input.page.encodedPath())
    } catch (failure: Exception) { release(id); throw failure }
  }
  private fun origin(projection: Projection): HubHtmlBroker = synchronized(this) {
    check(!closed && projection.active)
    val input = projection.input
    val identity = input.identity()
    val previous = aliases[identity]
    if (previous != null) {
      require(previous.input.binding == input.binding && previous.input.authorization == input.authorization && previous.input.page.chatId == input.page.chatId)
      previous.owners.add(projection)
      return@synchronized previous.broker
    }
    val alias = Alias(input)
    alias.owners.add(projection)
    val assets = HubHtmlAssets(input, policy(), alias::check)
    try { alias.broker = HubHtmlBroker(context(), identity, input.page, alias::check, assets) }
    catch (failure: Exception) { assets.close(); throw failure }
    aliases[identity] = alias
    alias.broker
  }
  fun attach(view: HubHtmlView, json: String) {
    if (view.attached(json)) return
    if (view.attachedElsewhere()) view.unbind()
    val input = org.json.JSONObject(json)
    require(input.length() == 2)
    val id = input.getString("projectionId")
    require(Regex("[0-9a-f]{64}").matches(id))
    val projection = synchronized(this) { values[id] } ?: error("HTML projection was closed")
    projection.check()
    val broker = projection.broker ?: error("HTML projection has no listener")
    val browserId = input.getString("browserId")
    require(browserId.length in 1..512)
    try {
      view.bind(browserId, broker.origin() + projection.input.page.encodedPath(), broker.origin(), broker.gate.cookie(), projection.input.page.chatId, projection::check) { projection.detach(view) }
      projection.attach(view)
      view.markAttached(json)
    } catch (failure: Exception) { view.retire(); projection.detach(view); throw failure }
  }
  fun current(id: String): Boolean {
    require(Regex("[0-9a-f]{64}").matches(id))
    val value = synchronized(this) { values[id] } ?: return false
    return runCatching { value.check(); value.broker != null }.getOrDefault(false)
  }
  fun release(id: String, notify: Boolean = true) {
    require(Regex("[0-9a-f]{64}").matches(id))
    val projection = synchronized(this) { values.remove(id) } ?: return
    projection.close()
    synchronized(this) {
      val identity = projection.input.identity()
      val alias = aliases[identity]
      if (alias != null) {
        alias.owners.remove(projection)
        if (alias.owners.isEmpty()) { alias.broker.close(); aliases.remove(identity) }
      }
    }
    if (notify) retired(id)
  }
  fun clear(scope: String) { synchronized(this) { values.filter { it.value.input.binding.scopeId == scope }.keys.toList() }.forEach(::release) }
  fun clearPrincipal(principal: String) { synchronized(this) { values.filter { it.value.input.binding.principalId == principal }.keys.toList() }.forEach(::release) }
  fun retainEnrollment(canonical: String, principal: String) {
    synchronized(this) { values.filter { it.value.input.binding.principalId != principal || it.value.input.binding.canonicalOrigin != canonical }.keys.toList() }.forEach(::release)
  }
  override fun close() {
    val ids = synchronized(this) { closed = true; values.keys.toList() }
    ids.forEach { release(it, false) }; subscription?.close(); subscription = null
  }
}
