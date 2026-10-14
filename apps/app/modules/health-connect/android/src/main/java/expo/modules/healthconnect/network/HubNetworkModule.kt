package expo.modules.healthconnect.network

import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.CredentialSlot
import expo.modules.healthconnect.ServerEnrollment
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class HubNetworkModule : Module() {
  private var activationAuthority: ServerEnrollment? = null
  private var activationOwner = 0L
  private var routeEvents: AutoCloseable? = null
  private fun authority(): HubRoutePolicy {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val policy = HubRoutePolicy.get(context)
    if (routeEvents == null) routeEvents = policy.subscribe { sendEvent("onRoute", it) }
    return policy
  }
  private val resources = HubResourceRegistrar(
    { appContext.reactContext ?: throw Exceptions.ReactContextLost() },
    { appContext.currentActivity }, ::authority)
  private val inspection = HubPairingInspection()
  private val html = HubHtmlRegistrar(::authority, ::htmlEnrollment) { sendEvent("onHtmlRetired", mapOf("id" to it)) }
  private var discovery: HubDiscovery? = null
  private var connectivity: HubConnectivity? = null
  private val sockets = HubSockets({ sendEvent("onSocket", it) }, ::authority)
  private fun htmlEnrollment(binding: HubRouteBinding): () -> Unit {
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    val authority = ServerEnrollment(context)
    val ticket = authority.capture(binding.canonicalOrigin, binding.principalId)
    return { authority.use(ticket, binding.scopeId, binding.credentialGeneration) {} }
  }
  override fun definition() = ModuleDefinition {
    Name("HubNetwork")
    Events("onDiscovery", "onNetwork", "onSocket", "onRoute", "onHtmlRetired")
    OnCreate {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val authority = ServerEnrollment(context)
      activationOwner = authority.beginActivationOwner()
      activationAuthority = authority
    }
    OnDestroy { html.close(); inspection.close(); activationAuthority?.endActivationOwner(activationOwner); activationAuthority = null; routeEvents?.close(); routeEvents = null; discovery?.stop(); connectivity?.stop(); sockets.stop(); resources.close(); discovery = null; connectivity = null }
    OnActivityEntersBackground { inspection.invalidate(); discovery?.stop() }
    AsyncFunction("inspectCandidate") Coroutine { json: String -> withContext(Dispatchers.IO) {
      inspection.inspect(json) { input -> discovery?.selected(input) ?: error("Pairing requires active discovery") }
    } }
    AsyncFunction("cancelInspection") { requestId: String -> inspection.cancel(requestId) }
    enrollmentFunctions()
    resources.register(this)
    html.register(this)
    Function("browserDiagnosticsVersion") { 1 }
    Function("browserDiagnosticsRawVersion") { 2 }
    Function("browserProfileReady") { HubBrowserPolicy.supported() }
    AsyncFunction("browserObserve") Coroutine { -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.replayAll(1) } }
    AsyncFunction("browserObserveRaw") Coroutine { -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.replayAll(2) } }
    AsyncFunction("browserPerform") Coroutine { json: String -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.perform(json) } }
    View(HubHtmlView::class) {
      Events("onStatus", "onDiagnostic")
      Prop("target") { view: HubHtmlView, json: String -> view.bindBrowser(json) }
      Prop("displayed") { view: HubHtmlView, value: Boolean -> view.displayed(value) }
      Prop("projection") { view: HubHtmlView, json: String -> html.attach(view, json) }
      Prop("command") { view: HubHtmlView, json: String -> view.command(json) }
      OnViewDestroys { view: HubHtmlView -> view.dispose() }
    }
    AsyncFunction("configureTrust") { json: String -> if (HubTransport.configure(json)) { val scope = JSONObject(json).getString("scopeId"); sockets.clearScope(scope); resources.clear(scope); html.clear(scope) } }
    AsyncFunction("clearTrust") { scopeId: String -> sockets.clearScope(scopeId); resources.clear(scopeId); html.clear(scopeId); HubTransport.clear(scopeId) }
    AsyncFunction("startNetwork") Coroutine { -> withContext(Dispatchers.Main) {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val source = connectivity ?: HubConnectivity(context, { sendEvent("onNetwork", it) }, { inspection.invalidate(); discovery?.networkChanged() }).also { connectivity = it }
      source.start()
    } }
    AsyncFunction("stopNetwork") Coroutine { -> withContext(Dispatchers.Main) { connectivity?.stop() } }
    AsyncFunction("openSocket") { json: String -> sockets.open(json) }
    AsyncFunction("sendSocket") { json: String -> sockets.send(json) }
    AsyncFunction("closeSocket") { id: String -> sockets.close(id) }
    AsyncFunction("startDiscovery") Coroutine { -> withContext(Dispatchers.Main) {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val source = discovery ?: HubDiscovery(context) { inspection.reconcile(); sendEvent("onDiscovery", it) }.also { discovery = it }
      source.start()
    } }
    AsyncFunction("stopDiscovery") Coroutine { -> withContext(Dispatchers.Main) { discovery?.stop() } }
    AsyncFunction("request") Coroutine { json: String -> withContext(Dispatchers.IO) { request(json) } }
  }
  private fun ModuleDefinitionBuilder.enrollmentFunctions() {
    Function("reserveServerActivation") { order: Long ->
      val authority = activationAuthority ?: error("Native activation owner is not initialized")
      authority.reserveActivation(activationOwner, order)
    }
    AsyncFunction("configureRoutes") Coroutine { json: String, enrollment: String -> withContext(Dispatchers.IO) {
      val policy = authority()
      val input = JSONObject(json)
      val scope = input.getJSONObject("trust").getString("scopeId")
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val generation = input.getJSONArray("bindings").getJSONObject(0).getLong("credentialGeneration")
      ServerEnrollment(context).use(enrollment, scope, generation) {
        val owner = JSONObject(enrollment)
        require(input.getString("canonicalOrigin") == owner.getString("canonicalOrigin"))
        val bindings = input.getJSONArray("bindings")
        require((0 until bindings.length()).all { bindings.getJSONObject(it).getString("principalId") == owner.getString("principalId") })
        policy.configure(input)
        ServerEnrollment(context).advance(scope, generation)
      }
      policy.awaitReady(scope)
    } }
    AsyncFunction("activateServerEnrollment") { canonical: String, principal: String, intent: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (JSONObject(intent).getLong("owner") != activationOwner) throw expo.modules.healthconnect.NativeCredentialWithdrawn()
      val ticket = Credentials(context, CredentialSlot.SERVER).activate(canonical, principal, intent)
      html.retainEnrollment(canonical, principal)
      ticket
    }
    AsyncFunction("claimServerEnrollment") { canonical: String, principal: String, scope: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ServerEnrollment(context).claim(canonical, principal, scope)
    }
    AsyncFunction("captureServerEnrollment") { canonical: String, principal: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      ServerEnrollment(context).capture(canonical, principal)
    }
    AsyncFunction("clearServerCredential") { principal: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      Credentials(context, CredentialSlot.SERVER).clear(principal)
      html.clearPrincipal(principal)
    }
    AsyncFunction("clearRoutes") { scopeId: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      synchronized(ServerEnrollment.LOCK) { ServerEnrollment(context).retire(scopeId); html.clear(scopeId); authority().clear(scopeId) }
    }
    AsyncFunction("refreshRoutes") { scopeId: String -> authority().refresh(scopeId) }
    AsyncFunction("routeState") { scopeId: String -> authority().snapshot(scopeId) }
  }
  private fun request(json: String): Map<String, Any?> {
    val input = JSONObject(json)
    val scope = input.getString("scopeId")
    val binding = input.optJSONObject("binding")?.let { HubRouteBinding.parse(it) }
    require((binding != null) == input.has("routeGeneration")) { "Binding and route generation must be supplied together" }
    require(binding == null || binding.scopeId == scope)
    val policy = if (binding == null) null else authority()
    val lease = if (binding == null) HubTransport.lease(input.getString("url"), scope)
      else policy?.lease(binding, input.getString("url"), input.getLong("routeGeneration")) ?: error("Missing route authority")
    val method = input.getString("method")
    require(method in listOf("GET", "POST", "PUT", "PATCH", "DELETE"))
    val body = if (input.isNull("body")) null else input.getString("body")
    require(body == null || body.toByteArray().size <= MAX_BYTES)
    val builder = Request.Builder().url(lease.url).method(method, (body ?: if (method in listOf("POST", "PUT", "PATCH")) "" else null)?.toRequestBody())
    val headers = input.getJSONObject("headers")
    require(headers.length() <= 64)
    headers.keys().forEach { key ->
      require(key.lowercase() !in listOf("host", "connection", "content-length", "transfer-encoding"))
      builder.header(key, headers.getString(key))
    }
    try { lease.client.newBuilder().callTimeout(15, java.util.concurrent.TimeUnit.SECONDS).build().newCall(builder.build()).execute().use { response ->
      require(response.code !in 300..399) { "Hub redirects are forbidden" }
      val source = response.body?.source()
      if (source != null) require(!source.request(MAX_BYTES.toLong() + 1)) { "Hub response exceeds limit" }
      val text = source?.readUtf8() ?: ""
      lease.check()
      return mapOf("status" to response.code, "body" to text, "headers" to response.headers.names().associateWith { response.header(it) ?: "" })
    } } catch (failure: java.io.IOException) {
      if (binding != null) policy?.failed(binding, lease.routeGeneration)
      throw failure
    }
  }
  companion object { private const val MAX_BYTES = 8 * 1024 * 1024 }
}
