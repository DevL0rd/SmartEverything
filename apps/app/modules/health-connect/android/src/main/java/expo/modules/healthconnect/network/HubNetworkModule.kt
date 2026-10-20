package expo.modules.healthconnect.network

import android.content.Context
import expo.modules.healthconnect.CredentialSlot
import expo.modules.healthconnect.Credentials
import expo.modules.healthconnect.ServerEnrollment
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class HubNetworkModule : Module() {
  private companion object {
    const val SCOPE = "hub-module"
  }

  private var routeEvents: AutoCloseable? = null
  private var discovery: HubDiscovery? = null
  private var connectivity: HubConnectivity? = null
  private val inspection = HubPairingInspection()
  private val enrollment by lazy { ServerEnrollment(context()) }
  private val resources = HubResourceRegistrar(::context, { appContext.currentActivity }, ::authority)
  private val html = HubHtmlRegistrar(::context, ::authority, ::htmlEnrollment) { sendEvent("onHtmlRetired", mapOf("id" to it)) }

  private fun context(): Context = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private fun authority(): HubRoutePolicy {
    val policy = HubRoutePolicy.get(context())
    if (routeEvents == null) {
      routeEvents = policy.subscribe {
        NativeLog.debug(SCOPE, "route.event_sent") { mapOf("scope" to NativeLog.scopeLabel(it.scopeId), "generation" to it.routeGeneration, "network" to it.networkGeneration, "readiness" to it.readiness.wire) }
        sendEvent("onRoute", it.toMap())
      }
      NativeLog.info(SCOPE, "route.subscribed")
    }
    return policy
  }

  private fun htmlEnrollment(binding: HubRouteBinding): () -> Unit {
    val ticket = enrollment.capture(binding.canonicalOrigin, binding.principalId)
    return { enrollment.use(ticket) {} }
  }

  private fun retireScope(scopeId: String) {
    resources.clear(scopeId)
    html.clear(scopeId)
  }

  private fun <T> traced(event: String, fields: () -> Map<String, Any?>, block: () -> T): T {
    val started = System.nanoTime()
    try {
      val result = block()
      NativeLog.debug(SCOPE, "$event.done", NativeLog.elapsedMs(started), fields)
      return result
    } catch (failure: Exception) {
      NativeLog.warn(SCOPE, "$event.failed", failure, NativeLog.elapsedMs(started), fields)
      throw failure
    }
  }

  private fun shutdown() {
    NativeLog.info(SCOPE, "module.shutdown") { mapOf("discovery" to (discovery != null), "connectivity" to (connectivity != null)) }
    html.close()
    inspection.close()
    routeEvents?.close()
    routeEvents = null
    discovery?.stop()
    connectivity?.stop()
    resources.close()
    discovery = null
    connectivity = null
  }

  override fun definition() = ModuleDefinition {
    Name("HubNetwork")
    Events("onDiscovery", "onNetwork", "onRoute", "onHtmlRetired")
    OnDestroy { shutdown() }
    OnCreate { NativeLog.info(SCOPE, "module.created") }
    OnActivityEntersBackground {
      NativeLog.info(SCOPE, "activity.background") { mapOf("discovery" to (discovery != null)) }
      inspection.invalidate()
      discovery?.stop()
    }
    pairingFunctions()
    enrollmentFunctions()
    transportFunctions()
    resources.register(this)
    html.register(this)
    browserFunctions()
  }

  private fun ModuleDefinitionBuilder.pairingFunctions() {
    AsyncFunction("inspectCandidate") Coroutine { json: String ->
      withContext(Dispatchers.IO) {
        val started = System.nanoTime()
        try {
          inspection.inspect(json) { input -> discovery?.selected(input) ?: error("Pairing requires active discovery") }.also {
            NativeLog.info(SCOPE, "pairing.inspected", NativeLog.elapsedMs(started))
          }
        } catch (failure: Exception) {
          NativeLog.warn(SCOPE, "pairing.inspect_failed", failure, NativeLog.elapsedMs(started))
          throw failure
        }
      }
    }
    AsyncFunction("cancelInspection") { requestId: String ->
      NativeLog.info(SCOPE, "pairing.cancelled") { mapOf("request" to requestId.take(8)) }
      inspection.cancel(requestId)
    }
    AsyncFunction("startDiscovery") Coroutine { ->
      withContext(Dispatchers.Main) {
        val source = discovery ?: HubDiscovery(context()) { inspection.reconcile(); sendEvent("onDiscovery", it.toMap()) }.also { discovery = it }
        NativeLog.info(SCOPE, "discovery.start_requested")
        source.start().toMap()
      }
    }
    AsyncFunction("stopDiscovery") Coroutine { ->
      withContext(Dispatchers.Main) {
        NativeLog.info(SCOPE, "discovery.stop_requested")
        discovery?.stop()
      }
    }
  }

  private fun ModuleDefinitionBuilder.enrollmentFunctions() {
    AsyncFunction("activateServerEnrollment") { canonical: String, principal: String ->
      traced("enrollment.activate", { mapOf("principal" to principal.take(8), "host" to NativeLog.hostOnly(canonical)) }) {
        val ticket = Credentials(context(), CredentialSlot.SERVER).activate(canonical, principal)
        html.retainEnrollment(canonical, principal)
        ticket
      }
    }
    AsyncFunction("captureServerEnrollment") { canonical: String, principal: String ->
      traced("enrollment.capture", { mapOf("principal" to principal.take(8)) }) { enrollment.capture(canonical, principal) }
    }
    AsyncFunction("clearServerCredential") { principal: String ->
      traced("enrollment.clear", { mapOf("principal" to principal.take(8)) }) {
        Credentials(context(), CredentialSlot.SERVER).clear(principal)
        html.clearPrincipal(principal)
      }
    }
    AsyncFunction("configureRoutes") Coroutine { json: String, ticket: String ->
      withContext(Dispatchers.IO) {
        traced("routes.configure", { mapOf("bytes" to json.length) }) { enrollment.use(ticket) { authority().configure(JSONObject(json)).toMap() } }
      }
    }
    AsyncFunction("clearRoutes") { scopeId: String ->
      traced("routes.clear", { mapOf("scope" to NativeLog.scopeLabel(scopeId)) }) {
        html.clear(scopeId)
        authority().clear(scopeId)
      }
    }
    AsyncFunction("refreshRoutes") { scopeId: String ->
      traced("routes.refresh", { mapOf("scope" to NativeLog.scopeLabel(scopeId)) }) { authority().refresh(scopeId).toMap() }
    }
    AsyncFunction("routeState") { scopeId: String ->
      traced("routes.state", { mapOf("scope" to NativeLog.scopeLabel(scopeId)) }) { authority().snapshot(scopeId).toMap() }
    }
  }

  private fun ModuleDefinitionBuilder.transportFunctions() {
    AsyncFunction("configureTrust") { json: String ->
      traced("trust.configure", { mapOf("bytes" to json.length) }) {
        val trust = HubTrust.parse(json)
        if (HubTransport.configure(trust)) retireScope(trust.scopeId)
      }
    }
    AsyncFunction("clearTrust") { scopeId: String ->
      traced("trust.clear", { mapOf("scope" to NativeLog.scopeLabel(scopeId)) }) {
        retireScope(scopeId)
        HubTransport.clear(scopeId)
      }
    }
    AsyncFunction("startNetwork") Coroutine { ->
      withContext(Dispatchers.Main) {
        val source = connectivity ?: HubConnectivity(context(), { inspection.invalidate(); discovery?.networkChanged() }) {
          NativeLog.debug(SCOPE, "network.event_sent") { mapOf("generation" to it["generation"]) }
          sendEvent("onNetwork", it)
        }.also { connectivity = it }
        NativeLog.info(SCOPE, "network.start_requested")
        source.start()
      }
    }
    AsyncFunction("stopNetwork") Coroutine { ->
      withContext(Dispatchers.Main) {
        NativeLog.info(SCOPE, "network.stop_requested")
        connectivity?.stop()
      }
    }
  }

  private fun ModuleDefinitionBuilder.browserFunctions() {
    Function("browserDiagnosticsVersion") { 1 }
    Function("browserDiagnosticsRawVersion") { 2 }
    Function("browserProfileReady") { HubBrowserPolicy.supported() }
    AsyncFunction("browserObserve") Coroutine { -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.replayAll(1) } }
    AsyncFunction("browserObserveRaw") Coroutine { -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.replayAll(2) } }
    AsyncFunction("browserPerform") Coroutine { json: String -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.perform(json) } }
    AsyncFunction("browserEvaluate") Coroutine { id: String, code: String -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.evaluate(id, code) } }
    AsyncFunction("browserPress") Coroutine { id: String, json: String -> withContext(Dispatchers.Main) { HubBrowserDiagnostics.press(id, json) } }
    View(HubHtmlView::class) {
      Events("onStatus", "onDiagnostic")
      Prop("target") { view: HubHtmlView, json: String -> view.bindBrowser(json) }
      Prop("displayed") { view: HubHtmlView, value: Boolean -> view.displayed(value) }
      Prop("projection") { view: HubHtmlView, json: String -> html.attach(view, json) }
      AsyncFunction("navigate") { view: HubHtmlView, url: String -> view.navigate(url) }
      AsyncFunction("reload") { view: HubHtmlView -> view.reload() }
      AsyncFunction("stop") { view: HubHtmlView -> view.stop() }
      AsyncFunction("back") { view: HubHtmlView -> view.back() }
      AsyncFunction("forward") { view: HubHtmlView -> view.forward() }
      OnViewDestroys { view: HubHtmlView -> view.dispose() }
    }
  }
}
