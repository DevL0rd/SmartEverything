package expo.modules.healthconnect.network

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.io.IOException
import java.net.URI
import java.util.concurrent.Executors
import org.json.JSONObject

class HubRoutePolicy private constructor(context: Context) {
  private class Group(val canonical: String, var trust: HubTrust) {
    var endpoint: HubRouteEndpoint? = null
    var generation = 0L
    var epoch = 0L
    var detail = "Verifying saved hub routes"
    var pending = true
  }
  private val store = HubRouteStore(context)
  private val configurations = mutableMapOf<String, HubRouteConfiguration>()
  private val groups = mutableMapOf<String, Group>()
  private val listeners = mutableSetOf<(Map<String, Any?>) -> Unit>()
  private val scheduler = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  private var routeGeneration = 0L
  private var configurationEpoch = 0L
  private var networkGeneration = 0L
  private var queued = false
  private var working = false
  private var observing = false
  private val discovery = HubDiscovery(context, ::discovered)
  private val connectivity = HubConnectivity(context, {}, ::networkChanged)
  init {
    HubRouteProbe.settled = { synchronized(this) { if (configurations.isNotEmpty()) refreshAll() } }
    store.load().forEach { install(it) }
    if (configurations.isNotEmpty()) { observe(); refreshAll() }
  }
  @Throws(expo.modules.healthconnect.NativeCredentialWithdrawn::class) @Synchronized fun configure(input: JSONObject, native: Boolean = false): Map<String, Any?> {
    val raw = JSONObject(input.toString())
    val trust = raw.getJSONObject("trust")
    val canonical = raw.getString("canonicalOrigin")
    val endpoints = trust.getJSONArray("endpoints")
    if ((0 until endpoints.length()).none { HubTrust.origin(URI(endpoints.getJSONObject(it).getString("url"))) == HubTrust.origin(URI(canonical)) }) {
      require(endpoints.length() < 32) { "Canonical endpoint requires an inventory slot" }
      endpoints.put(JSONObject().put("url", canonical).put("kind", "remote"))
    }
    val next = HubRouteConfiguration.parse(raw)
    require(native || next.bindings.all { it.credentialKind == "client" }) { "Native credential roles are independently registered" }
    val old = configurations[next.trust.scopeId]
    if (old != null && (old.canonical != next.canonical || next.bindings.any { binding -> old.bindings.any { previous ->
      binding.credentialKind == previous.credentialKind && binding.principalId != previous.principalId } }))
      throw expo.modules.healthconnect.NativeCredentialWithdrawn()
    if (old != null && next.bindings.any { binding -> old.bindings.any { previous ->
      binding.principalId == previous.principalId && binding.credentialKind == previous.credentialKind &&
        binding.credentialGeneration < previous.credentialGeneration } }) throw expo.modules.healthconnect.NativeCredentialWithdrawn()
    if (old?.raw?.toString() == next.raw.toString()) return snapshot(next.trust.scopeId)
    val retired = retiredScopes(next, native)
    val staged = mergeInventory(configurations.values.filter { it.trust.scopeId !in retired } + next, next.canonical)
    require(staged.size <= 64)
    val owner = groups[next.canonical]
    require(owner == null || sameIdentity(owner.trust, next.trust)) { "Canonical hub identity changed; withdraw its old enrollment first" }
    store.save(staged)
    retired.forEach(::clearMemory)
    staged.filter { it.canonical == next.canonical }.forEach(::install)
    observe()
    refreshAll()
    return snapshot(next.trust.scopeId)
  }
  private fun retiredScopes(next: HubRouteConfiguration, native: Boolean): Set<String> {
    val old = configurations[next.trust.scopeId]
    val formerClients = if (native) emptyList() else configurations.values.filter { it.canonical == next.canonical &&
      it.trust.scopeId != next.trust.scopeId && it.bindings.all { binding -> binding.credentialKind == "client" } }
    val principals = formerClients.flatMap { it.bindings }.filter { binding -> next.bindings.none { it.principalId == binding.principalId } }
      .map { it.principalId }.toSet() + if (!native && old != null && old.bindings != next.bindings) old.bindings.map { it.principalId } else emptyList()
    val servers = configurations.values.filter { it.canonical == next.canonical &&
      it.bindings.any { binding -> binding.credentialKind == "server" && binding.principalId in principals } }
    return (formerClients + servers).map { it.trust.scopeId }.toSet() + if (old == null) emptySet() else setOf(old.trust.scopeId)
  }
  private fun install(next: HubRouteConfiguration) {
    val group = groups[next.canonical]
    require(group == null || sameIdentity(group.trust, next.trust)) { "Canonical hub identity changed; withdraw its old enrollment first" }
    configurations[next.trust.scopeId] = next
    groups.getOrPut(next.canonical) { Group(next.canonical, next.trust).apply { generation = ++routeGeneration } }.apply {
      trust = next.trust; epoch = ++configurationEpoch
    }
    HubTransport.configure(next.raw.getJSONObject("trust").toString())
  }
  private fun mergeInventory(values: List<HubRouteConfiguration>, canonical: String): List<HubRouteConfiguration> {
    val peers = values.filter { it.canonical == canonical }
    val endpoints = peers.flatMap { config ->
      val entries = config.raw.getJSONObject("trust").getJSONArray("endpoints")
      (0 until entries.length()).map { entries.getJSONObject(it) }
    }.distinctBy { HubTrust.origin(URI(it.getString("url"))) }.take(32)
    val addresses = peers.flatMap { it.trust.addresses }.distinctBy { it.hostAddress }.take(32)
    return values.map { peer ->
      if (peer.canonical != canonical) peer else {
        val raw = JSONObject(peer.raw.toString())
        raw.getJSONObject("trust").put("endpoints", org.json.JSONArray(endpoints))
          .put("lanAddresses", org.json.JSONArray(addresses.map { it.hostAddress }))
        HubRouteConfiguration.parse(raw)
      }
    }
  }
  @Synchronized fun clear(scopeId: String) {
    try { store.save(configurations.values.filter { it.trust.scopeId != scopeId }) }
    finally { clearMemory(scopeId) }
    if (configurations.isEmpty()) main.post { synchronized(this) {
      if (configurations.isEmpty()) { connectivity.stop(); discovery.stop(); observing = false }
    } }
  }
  private fun clearMemory(scopeId: String) {
    val previous = configurations[scopeId] ?: return
    val withdrawn = snapshot(scopeId).toMutableMap().apply {
      put("readiness", "unavailable"); put("detail", "Hub credential binding was withdrawn")
      put("routeGeneration", groups.getValue(previous.canonical).generation + 1); remove("endpoint")
    }
    val removed = configurations.remove(scopeId) ?: return
    listeners.toList().forEach { it(withdrawn) }
    HubTransport.clear(scopeId)
    (this as java.lang.Object).notifyAll()
    val group = groups.getValue(removed.canonical)
    group.epoch = ++configurationEpoch
    if (configurations.values.none { it.canonical == removed.canonical }) groups.remove(removed.canonical)
  }
  @Synchronized fun inventory(canonical: String, identity: JSONObject): JSONObject? = configurations.values
    .firstOrNull { it.canonical == canonical && it.trust.hubId == identity.getString("id") &&
      it.trust.certificateSha256 == identity.getJSONObject("tls").getString("certificateSha256") &&
      it.trust.serverName == identity.getJSONObject("tls").getString("serverName") &&
      it.trust.publicKeySha256 == identity.getJSONObject("tls").getString("publicKeySha256") }
    ?.raw?.getJSONObject("trust")?.let { JSONObject(it.toString()) }
  @Synchronized fun awaitReady(scopeId: String): Map<String, Any?> {
    val deadline = System.nanoTime() + READINESS_TIMEOUT_NANOS
    while (snapshot(scopeId)["readiness"] == "pending") {
      val remaining = (deadline - System.nanoTime()) / 1_000_000
      if (remaining <= 0) break
      (this as java.lang.Object).wait(remaining)
    }
    return snapshot(scopeId)
  }
  @Synchronized fun snapshot(scopeId: String): Map<String, Any?> {
    val config = configurations[scopeId] ?: error("Hub route scope is withdrawn")
    val group = groups.getValue(config.canonical)
    val state = if (group.pending) "pending" else if (group.endpoint == null) "unavailable" else "ready"
    return mutableMapOf<String, Any?>("scopeId" to scopeId, "canonicalOrigin" to config.canonical,
      "hubId" to config.trust.hubId, "routeGeneration" to group.generation,
      "networkGeneration" to networkGeneration, "readiness" to state, "detail" to group.detail)
      .apply { if (state == "ready") put("endpoint", group.endpoint?.snapshot()) }
  }
  @Synchronized fun subscribe(listener: (Map<String, Any?>) -> Unit): AutoCloseable {
    listeners.add(listener)
    return AutoCloseable { synchronized(this) { listeners.remove(listener) } }
  }
  @Synchronized fun refresh(scopeId: String): Map<String, Any?> { require(configurations.containsKey(scopeId)); refreshAll(); return snapshot(scopeId) }
  @Synchronized private fun refreshAll() {
    queued = true
    if (working) return
    working = true
    scheduler.execute(::drain)
  }
  private fun drain() {
    while (true) {
      val batch = synchronized(this) {
        if (!queued) { working = false; return }
        queued = false
        groups.values.map { Triple(it.canonical, it.epoch, networkGeneration) }
      }
      batch.forEach { probe(it) }
    }
  }
  private fun probe(batch: Triple<String, Long, Long>) {
    val prepared = synchronized(this) {
      val group = groups[batch.first] ?: return
      val config = configurations.values.firstOrNull { it.canonical == group.canonical } ?: return
      Triple(config.trust.scopeId, group.trust, candidates(config))
    }
    val selected = try { HubRouteProbe.batch(prepared.first, prepared.second, prepared.third) }
      catch (failure: Exception) { null }
    synchronized(this) {
      val group = groups[batch.first] ?: return
      if (group.epoch != batch.second || networkGeneration != batch.third) return
      if (group.endpoint != selected) { retireTransports(group.canonical); group.generation = ++routeGeneration }
      group.endpoint = selected
      group.pending = false
      group.detail = if (selected == null) "No independently trusted hub identity answered" else ""
      notifyGroup(group.canonical)
      (this as java.lang.Object).notifyAll()
    }
  }
  private fun candidates(config: HubRouteConfiguration): List<HubRouteEndpoint> {
    val values = config.raw.getJSONObject("trust").getJSONArray("endpoints")
    val endpoints = (0 until values.length()).map { values.getJSONObject(it) }
      .filter { it.getString("kind") != "loopback" }.map { HubRouteEndpoint(it.getString("url"), it.getString("kind")) }
    val local = endpoints.filter { it.kind == "lan" }.take(HubRouteProbe.MAX_PROBES - 1)
    val remote = endpoints.firstOrNull { it.url == config.canonical && it.kind == "remote" }
      ?: HubRouteEndpoint(config.canonical, "remote")
    return local + remote
  }
  private fun retireTransports(canonical: String) {
    configurations.values.filter { it.canonical == canonical }.forEach {
      HubTransport.clear(it.trust.scopeId)
      HubTransport.configure(it.raw.getJSONObject("trust").toString())
    }
  }
  private fun notifyGroup(canonical: String) {
    configurations.values.filter { it.canonical == canonical }.forEach { config ->
      val state = snapshot(config.trust.scopeId)
      listeners.toList().forEach { it(state) }
    }
  }
  private fun observe() { main.post { synchronized(this) {
    if (!observing && configurations.isNotEmpty()) { observing = true; connectivity.start(); discovery.start() }
  } } }
  @Synchronized private fun networkChanged() {
    networkGeneration += 1
    groups.values.forEach { it.epoch = ++configurationEpoch; it.pending = true; it.generation = ++routeGeneration; it.endpoint = null; notifyGroup(it.canonical); retireTransports(it.canonical) }
    HubRouteProbe.cancel()
    discovery.start()
    refreshAll()
  }
  @Synchronized private fun discovered(state: Map<String, Any?>) {
    val entries = state["candidates"] as? List<*> ?: return
    var changed = false
    entries.filterIsInstance<Map<*, *>>().forEach { candidate ->
      val hub = candidate["hubId"] as? String ?: return@forEach
      val url = candidate["url"] as? String ?: return@forEach
      configurations.values.toList().filter { it.trust.hubId == hub }.forEach { config ->
        if (config.trust.endpoints.containsKey(HubTrust.origin(URI(url)))) return@forEach
        val raw = JSONObject(config.raw.toString())
        val trust = raw.getJSONObject("trust")
        if (trust.getJSONArray("endpoints").length() >= 32 || trust.getJSONArray("lanAddresses").length() >= 32) return@forEach
        val address = URI(url).host.removePrefix("[").removeSuffix("]")
        HubTrust.literal(address)
        trust.getJSONArray("endpoints").put(JSONObject().put("kind", "lan").put("url", url))
        trust.getJSONArray("lanAddresses").put(address)
        val next = HubRouteConfiguration.parse(raw)
        configurations[next.trust.scopeId] = next
        groups.getValue(next.canonical).apply { this.trust = next.trust; epoch = ++configurationEpoch }
        HubTransport.configure(trust.toString())
        changed = true
      }
    }
    if (changed) { store.save(configurations.values); refreshAll() }
  }
  fun lease(binding: HubRouteBinding, input: String, generation: Long? = null): HubLease = synchronized(this) {
    val config = configurations[binding.scopeId] ?: throw expo.modules.healthconnect.NativeCredentialWithdrawn()
    if (!config.bindings.contains(binding)) throw expo.modules.healthconnect.NativeCredentialWithdrawn()
    val group = groups.getValue(config.canonical)
    if (generation != null && (group.pending || generation != group.generation)) throw IOException("Hub route generation changed")
    val expires = System.nanoTime() + READINESS_TIMEOUT_NANOS
    while (group.pending && System.nanoTime() < expires) {
      (this as java.lang.Object).wait(maxOf(1, (expires - System.nanoTime()) / 1_000_000))
      if (configurations[binding.scopeId]?.bindings?.contains(binding) != true) throw expo.modules.healthconnect.NativeCredentialWithdrawn()
    }
    val selected = group.endpoint ?: throw IOException(group.detail)
    if (group.pending || (generation != null && generation != group.generation)) throw IOException("Hub route generation changed")
    val uri = URI(input.replaceFirst("wss:", "https:"))
    require(uri.scheme == "https" && uri.userInfo == null && uri.fragment == null && uri.host != null)
    require(HubTrust.origin(uri) == HubTrust.origin(URI(binding.canonicalOrigin)) ||
      config.trust.endpoints.containsKey(HubTrust.origin(uri))) { "Hub request belongs to another canonical origin" }
    val suffix = uri.rawPath.orEmpty() + (uri.rawQuery?.let { "?$it" } ?: "")
    val selectedUrl = selected.url.trimEnd('/') + suffix
    val route = group.generation
    val lease = HubTransport.lease(if (input.startsWith("wss:")) selectedUrl.replaceFirst("https:", "wss:") else selectedUrl, binding.scopeId)
    lease.copy(current = { check(binding, route) }, routeGeneration = route)
  }
  @Synchronized fun guestBinding(canonical: String, token: String): HubRouteBinding? {
    val principal = HubRouteBindings.fingerprint(token)
    val matches = configurations.values.filter { it.canonical == canonical }.flatMap { it.bindings }
      .filter { it.credentialKind == "client" && it.principalId == principal }
    require(matches.size <= 1) { "Guest credential has ambiguous native client ownership" }
    return matches.singleOrNull()
  }
  @Synchronized fun bound(binding: HubRouteBinding): Boolean = configurations[binding.scopeId]?.bindings?.contains(binding) == true
  @Synchronized fun check(binding: HubRouteBinding, generation: Long) {
    val config = configurations[binding.scopeId]
    val group = groups[binding.canonicalOrigin]
    if (config?.bindings?.contains(binding) != true || group == null || group.pending || group.generation != generation)
      throw IOException("Hub credential or route generation was withdrawn")
  }
  @Synchronized fun failed(binding: HubRouteBinding, generation: Long?) {
    val group = groups[binding.canonicalOrigin] ?: return
    if (configurations[binding.scopeId]?.bindings?.contains(binding) == true && (generation == null || generation == group.generation)) refreshAll()
  }
  companion object {
    private const val READINESS_TIMEOUT_NANOS = 20_000_000_000L
    @Volatile private var instance: HubRoutePolicy? = null
    fun get(context: Context): HubRoutePolicy = instance ?: synchronized(this) {
      instance ?: HubRoutePolicy(context.applicationContext).also { instance = it }
    }
    private fun sameIdentity(left: HubTrust, right: HubTrust): Boolean = left.hubId == right.hubId &&
      left.certificateSha256 == right.certificateSha256 && left.serverName == right.serverName
  }
}
