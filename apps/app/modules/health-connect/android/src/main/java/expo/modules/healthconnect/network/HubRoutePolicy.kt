package expo.modules.healthconnect.network

import android.content.Context
import android.os.Handler
import android.os.Looper
import expo.modules.healthconnect.NativeCredentialWithdrawn
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.diagnostics.NativeTally
import java.io.IOException
import java.net.URI
import java.util.concurrent.Executors
import org.json.JSONObject

class HubRoutePolicy private constructor(context: Context) {
  private data class Probe(val canonical: String, val token: Long)

  private val store = HubRouteStore(context)
  private val configurations = mutableMapOf<String, HubRouteConfiguration>()
  private val groups = mutableMapOf<String, HubRouteGroup>()
  private val selections = store.loadSelected().toMutableMap()
  private val listeners = mutableSetOf<(HubRouteSnapshot) -> Unit>()
  private val scheduler = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private var routeGeneration = 0L
  private var probeToken = 0L
  private var networkGeneration = 0L
  private var queued = false
  private var working = false
  private var observing = false
  private val discovery = HubDiscovery(context, ::discovered)
  private val connectivity = HubConnectivity(context, ::networkChanged)
  private val leases = NativeTally(SCOPE, "lease.summary")

  init {
    store.load().forEach(::install)
    NativeLog.info(SCOPE, "authority.restored") { mapOf("scopes" to configurations.size, "groups" to groups.size, "selections" to selections.size) }
    if (configurations.isNotEmpty()) {
      observe()
      refreshAll()
    }
  }

  @Throws(NativeCredentialWithdrawn::class)
  @Synchronized
  fun configure(input: JSONObject, native: Boolean = false): HubRouteSnapshot {
    val next = withCanonicalEndpoint(HubRouteConfiguration.parse(input))
    require(native || next.bindings.all { it.credentialKind == "client" }) { "Native credential roles are independently registered" }
    val old = configurations[next.trust.scopeId]
    if (old != null) {
      try {
        rejectSuperseded(old, next)
      } catch (failure: NativeCredentialWithdrawn) {
        NativeLog.warn(SCOPE, "configure.superseded", failure) { mapOf("scope" to NativeLog.scopeLabel(next.trust.scopeId), "native" to native) }
        throw failure
      }
    }
    val owner = groups[next.canonical]
    require(owner == null || owner.trust.sameHub(next.trust)) { "Canonical hub identity changed; withdraw its old enrollment first" }
    val retired = retiredScopes(next, native)
    val staged = mergeInventory(configurations.values.filter { it.trust.scopeId !in retired } + next, next.canonical)
    if (old != null && retired.isEmpty() && staged.first { it.trust.scopeId == next.trust.scopeId } == old) {
      NativeLog.debug(SCOPE, "configure.unchanged") { mapOf("scope" to NativeLog.scopeLabel(next.trust.scopeId), "native" to native) }
      return snapshot(next.trust.scopeId)
    }
    HubRouteLog.applied(next, old, retired, native)
    store.save(staged)
    retired.forEach(::clearMemory)
    staged.filter { it.canonical == next.canonical }.forEach(::install)
    observe()
    refreshAll()
    if (old != null && old.bindings != next.bindings) notifyGroup(next.canonical)
    return snapshot(next.trust.scopeId)
  }

  private fun withCanonicalEndpoint(config: HubRouteConfiguration): HubRouteConfiguration {
    if (config.trust.endpoints.containsKey(HubTrust.origin(URI(config.canonical)))) return config
    val inventory = config.trust.inventory + HubRouteEndpoint(config.canonical, "remote")
    return config.copy(trust = config.trust.copy(inventory = inventory))
  }

  private fun rejectSuperseded(old: HubRouteConfiguration, next: HubRouteConfiguration) {
    val changedOwner = old.canonical != next.canonical || next.bindings.any { binding ->
      old.bindings.any { it.credentialKind == binding.credentialKind && it.principalId != binding.principalId }
    }
    val older = next.bindings.any { binding ->
      old.bindings.any {
        it.credentialKind == binding.credentialKind && it.principalId == binding.principalId &&
          binding.credentialGeneration < it.credentialGeneration
      }
    }
    if (changedOwner || older) throw NativeCredentialWithdrawn()
  }

  private fun retiredScopes(next: HubRouteConfiguration, native: Boolean): Set<String> {
    val old = configurations[next.trust.scopeId]
    val peers = configurations.values.filter { it.canonical == next.canonical && it.trust.scopeId != next.trust.scopeId }
    val formerClients = if (native) emptyList() else peers.filter { peer -> peer.bindings.all { it.credentialKind == "client" } }
    val replaced = formerClients.flatMap { it.bindings }.map { it.principalId }
      .filter { principal -> next.bindings.none { it.principalId == principal } }
    val rebound = if (!native && old != null && old.bindings != next.bindings) old.bindings.map { it.principalId } else emptyList()
    val principals = (replaced + rebound).toSet()
    val servers = peers.filter { peer -> peer.bindings.any { it.credentialKind == "server" && it.principalId in principals } }
    return (formerClients + servers).map { it.trust.scopeId }.toSet()
  }

  private fun install(next: HubRouteConfiguration) {
    val group = groups[next.canonical]
    require(group == null || group.trust.sameHub(next.trust)) { "Canonical hub identity changed; withdraw its old enrollment first" }
    configurations[next.trust.scopeId] = next
    val remembered = selections[next.canonical]?.takeIf { next.trust.endpoints.containsKey(it.origin) }
    val installed = group ?: HubRouteGroup(next.canonical, next.trust, remembered).also {
      it.generation = ++routeGeneration
      groups[next.canonical] = it
    }
    installed.trust = next.trust
    installed.probe = ++probeToken
    HubTransport.configure(next.trust)
    HubRouteLog.installed(next, installed, remembered, group == null)
  }

  private fun mergeInventory(values: List<HubRouteConfiguration>, canonical: String): List<HubRouteConfiguration> {
    val peers = values.filter { it.canonical == canonical }
    val inventory = peers.flatMap { it.trust.inventory }.distinctBy { it.origin }
    val addresses = peers.flatMap { it.trust.addresses }.distinctBy { it.hostAddress }
    return values.map { config ->
      if (config.canonical != canonical) config else config.copy(trust = config.trust.copy(inventory = inventory, addresses = addresses))
    }
  }

  @Synchronized fun clear(scopeId: String) {
    try {
      store.save(configurations.values.filter { it.trust.scopeId != scopeId })
    } finally {
      clearMemory(scopeId)
    }
    if (configurations.isEmpty()) main.post { stopObserving() }
  }

  @Synchronized private fun stopObserving() {
    if (!configurations.isEmpty()) return
    connectivity.stop()
    discovery.stop()
    observing = false
  }

  private fun clearMemory(scopeId: String) {
    val previous = configurations[scopeId] ?: return
    val group = groups.getValue(previous.canonical)
    val withdrawn = snapshot(scopeId).copy(
      readiness = HubRouteReadiness.UNAVAILABLE,
      detail = "Hub credential binding was withdrawn",
      routeGeneration = group.generation + 1,
      endpoint = null,
    )
    configurations.remove(scopeId)
    NativeLog.info(SCOPE, "scope.cleared") { mapOf("scope" to NativeLog.scopeLabel(scopeId), "generation" to group.generation, "listeners" to listeners.size) }
    listeners.toList().forEach { it(withdrawn) }
    HubTransport.clear(scopeId)
    group.probe = ++probeToken
    if (configurations.values.none { it.canonical == previous.canonical }) {
      groups.remove(previous.canonical)
      remember(previous.canonical, null)
    }
  }

  @Synchronized fun enrolled(canonical: String): HubRouteConfiguration? =
    configurations.values.firstOrNull { it.canonical == canonical }

  @Synchronized fun snapshot(scopeId: String): HubRouteSnapshot {
    val config = configurations[scopeId] ?: error("Hub route scope is withdrawn")
    val group = groups.getValue(config.canonical)
    return HubRouteSnapshot(
      scopeId,
      config.canonical,
      config.trust.hubId,
      group.generation,
      networkGeneration,
      group.readiness(),
      group.detail,
      group.endpoint,
    )
  }

  @Synchronized fun subscribe(listener: (HubRouteSnapshot) -> Unit): AutoCloseable {
    listeners.add(listener)
    return AutoCloseable { synchronized(this) { listeners.remove(listener) } }
  }

  @Synchronized fun refresh(scopeId: String): HubRouteSnapshot {
    require(configurations.containsKey(scopeId))
    NativeLog.debug(SCOPE, "refresh.requested") { mapOf("scope" to NativeLog.scopeLabel(scopeId)) }
    discovery.recover()
    refreshAll()
    return snapshot(scopeId)
  }

  @Synchronized private fun refreshAll() {
    queued = true
    if (working) return
    working = true
    scheduler.execute(::drain)
  }

  private fun drain() {
    while (true) {
      val batch = synchronized(this) {
        if (!queued) {
          working = false
          return
        }
        queued = false
        groups.values.map { Probe(it.canonical, it.probe) }
      }
      NativeLog.debug(SCOPE, "probe.batch") { mapOf("groups" to batch.size, "network" to networkGeneration) }
      batch.forEach(::probe)
    }
  }

  private fun probe(batch: Probe) {
    val prepared = synchronized(this) {
      val group = groups[batch.canonical] ?: return
      val config = configurations.values.firstOrNull { it.canonical == group.canonical } ?: return
      Triple(config.trust.scopeId, group.trust, candidates(config))
    }
    val started = System.nanoTime()
    NativeLog.debug(SCOPE, "probe.started") {
      mapOf("scope" to NativeLog.scopeLabel(prepared.first), "probeToken" to batch.token, "candidates" to prepared.third.map { it.kind })
    }
    val selected = try {
      HubRouteProbe.select(prepared.first, prepared.second, prepared.third)
    } catch (failure: Exception) {
      NativeLog.warn(SCOPE, "probe.failed", failure, NativeLog.elapsedMs(started)) {
        mapOf("scope" to NativeLog.scopeLabel(prepared.first), "probeToken" to batch.token)
      }
      null
    }
    HubRouteLog.probeFinished(prepared.first, batch.token, prepared.third.size, selected, started)
    accept(batch, selected)
  }

  @Synchronized private fun accept(batch: Probe, selected: HubRouteEndpoint?) {
    val group = groups[batch.canonical] ?: return
    if (group.probe != batch.token) {
      NativeLog.debug(SCOPE, "probe.discarded") { mapOf("reason" to "superseded", "probeToken" to batch.token, "current" to group.probe) }
      return
    }
    val before = group.endpoint
    group.settle(selected) { ++routeGeneration }
    if (group.endpoint != before) remember(group.canonical, group.endpoint)
    val announced = group.announce(networkGeneration)
    HubRouteLog.settled(group, networkGeneration, group.endpoint != before, announced, listeners.size)
    if (announced) notifyGroup(group.canonical)
  }

  private fun remember(canonical: String, endpoint: HubRouteEndpoint?) {
    if (endpoint == null) selections.remove(canonical) else selections[canonical] = endpoint
    try {
      store.saveSelected(selections)
    } catch (failure: IOException) {
      NativeLog.warn(SCOPE, "selection.save_failed", failure) { mapOf("canonical" to NativeLog.hostOnly(canonical)) }
    }
  }

  private fun candidates(config: HubRouteConfiguration): List<HubRouteEndpoint> {
    val usable = config.trust.inventory.filter { it.kind != "loopback" }
    return usable.filter { it.kind == "lan" }.asReversed() + usable.filter { it.kind == "remote" }
  }

  private fun notifyGroup(canonical: String) {
    configurations.values.filter { it.canonical == canonical }.forEach { config ->
      val state = snapshot(config.trust.scopeId)
      HubRouteLog.notified(state, listeners.size)
      listeners.toList().forEach { it(state) }
    }
  }

  private fun observe() {
    main.post {
      synchronized(this) {
        if (!observing && configurations.isNotEmpty()) {
          observing = true
          connectivity.start()
          discovery.start()
        }
      }
    }
  }

  @Synchronized private fun networkChanged() {
    networkGeneration += 1
    NativeLog.info(SCOPE, "network.invalidated") { mapOf("network" to networkGeneration, "groups" to groups.size) }
    groups.values.forEach { it.probe = ++probeToken }
    HubTransport.evictIdle()
    HubRouteProbe.cancel()
    discovery.start()
    refreshAll()
  }

  @Synchronized private fun discovered(state: HubDiscoverySnapshot) {
    var learned = false
    state.candidates.forEach { candidate ->
      configurations.values.filter { it.trust.hubId == candidate.hubId }.toList().forEach { config ->
        withLanEndpoint(config, candidate.url)?.let {
          install(it)
          learned = true
        }
      }
    }
    NativeLog.debug(SCOPE, "discovery.applied") { mapOf("candidates" to state.candidates.size, "learned" to learned, "state" to state.state) }
    if (!learned) return
    store.save(configurations.values)
    refreshAll()
  }

  private fun withLanEndpoint(config: HubRouteConfiguration, url: String): HubRouteConfiguration? {
    val endpoint = HubRouteEndpoint(url, "lan")
    if (config.trust.endpoints.containsKey(endpoint.origin)) return null
    val address = HubTrust.literal(URI(url).host.removePrefix("[").removeSuffix("]"))
    val addresses = (config.trust.addresses + address).distinctBy { it.hostAddress }
    return config.copy(trust = config.trust.copy(inventory = config.trust.inventory + endpoint, addresses = addresses))
  }

  @Synchronized fun lease(binding: HubRouteBinding, input: String): HubLease {
    val config = boundConfiguration(binding)
    val group = groups.getValue(config.canonical)
    val selected = group.endpoint ?: run {
      HubRouteLog.unavailable(binding.scopeId, group)
      throw HubRouteUnavailable(group.detail)
    }
    val leaseStarted = System.nanoTime()
    val uri = URI(input.replaceFirst("wss:", "https:"))
    require(uri.scheme == "https" && uri.userInfo == null && uri.fragment == null && uri.host != null)
    val origin = HubTrust.origin(uri)
    require(origin == HubTrust.origin(URI(binding.canonicalOrigin)) || config.trust.endpoints.containsKey(origin)) {
      "Hub request belongs to another canonical origin"
    }
    val target = selected.url.trimEnd('/') + uri.rawPath.orEmpty() + (uri.rawQuery?.let { "?$it" } ?: "")
    val routed = if (input.startsWith("wss:")) target.replaceFirst("https:", "wss:") else target
    val issued = HubTransport.lease(routed, binding.scopeId).copy(current = { requireBound(binding) })
    leases.add(NativeLog.elapsedMs(leaseStarted))
    return issued
  }

  @Synchronized private fun boundConfiguration(binding: HubRouteBinding): HubRouteConfiguration {
    val config = configurations[binding.scopeId]
    if (config == null || !config.bindings.contains(binding)) throw NativeCredentialWithdrawn()
    return config
  }

  @Synchronized fun bound(binding: HubRouteBinding): Boolean = configurations[binding.scopeId]?.bindings?.contains(binding) == true

  @Synchronized private fun requireBound(binding: HubRouteBinding) {
    if (!bound(binding)) throw IOException("Hub credential was withdrawn")
  }

  @Synchronized fun failed(binding: HubRouteBinding) {
    if (!bound(binding)) {
      NativeLog.debug(SCOPE, "failure.ignored") { mapOf("reason" to "unbound", "scope" to NativeLog.scopeLabel(binding.scopeId)) }
      return
    }
    NativeLog.info(SCOPE, "failure.reported") { mapOf("scope" to NativeLog.scopeLabel(binding.scopeId), "action" to "rediscover_and_reprobe") }
    discovery.recover()
    refreshAll()
  }

  companion object {
    private const val SCOPE = "hub-route"
    @Volatile private var instance: HubRoutePolicy? = null

    fun get(context: Context): HubRoutePolicy = instance ?: synchronized(this) {
      instance ?: HubRoutePolicy(context.applicationContext).also { instance = it }
    }
  }
}
