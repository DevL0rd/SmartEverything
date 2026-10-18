package expo.modules.healthconnect.network

import android.content.Context
import android.content.pm.PackageManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.healthconnect.diagnostics.NativeLog
import org.json.JSONObject

data class HubCandidate(val name: String, val url: String, val hubId: String, val protocolVersion: Int) {
  fun toMap(): Map<String, Any?> = mapOf("name" to name, "url" to url, "hubId" to hubId, "protocolVersion" to protocolVersion)
}

data class HubDiscoverySnapshot(val generation: Long, val state: String, val detail: String, val candidates: List<HubCandidate>) {
  fun toMap(): Map<String, Any?> =
    mapOf("generation" to generation, "state" to state, "detail" to detail, "candidates" to candidates.map(HubCandidate::toMap))
}

class HubDiscovery(private val context: Context, private val emit: (HubDiscoverySnapshot) -> Unit) {
  @Volatile private var published = HubDiscoverySnapshot(0, "idle", "", emptyList())
  fun selected(input: JSONObject): HubPairingSelection {
    val snapshot = published
    require(snapshot.state == "searching" && snapshot.generation == input.getLong("generation")) { "Pairing discovery generation was withdrawn" }
    val candidate = snapshot.candidates.firstOrNull { it.url == input.getString("url") }
      ?: error("Pairing inspection requires a selected current discovery record")
    return HubPairingSelection(snapshot.generation, candidate.url, candidate.hubId) {
      val current = published
      current.generation == snapshot.generation && current.state == "searching" && current.candidates.any { it === candidate }
    }
  }
  private val handler = Handler(Looper.getMainLooper())
  private val nsd = context.getSystemService(NsdManager::class.java)
  private var generation = 0L
  private var running = false
  private var state = "idle"
  private var detail = ""
  private var browser: NsdManager.DiscoveryListener? = null
  private var resolver: NsdManager.ResolveListener? = null
  private val pending = ArrayDeque<NsdServiceInfo>()
  private val visible = mutableSetOf<String>()
  private val candidates = mutableMapOf<String, HubCandidate>()
  fun recover() { handler.post { if (!running) start() } }
  fun start(): HubDiscoverySnapshot {
    stop()
    generation += 1
    if (Build.VERSION.SDK_INT >= 37 && context.applicationInfo.targetSdkVersion >= 37 &&
      context.checkSelfPermission("android.permission.ACCESS_LOCAL_NETWORK") != PackageManager.PERMISSION_GRANTED)
      return snapshot("permission-required", "Allow local network access to find your hub").also(emit)
    running = true
    snapshot("searching", "")
    begin()
    handler.postDelayed({ stop() }, WINDOW_MS)
    return snapshot(state, detail)
  }
  fun stop() {
    running = false
    generation += 1
    handler.removeCallbacksAndMessages(null)
    stopBrowser()
    stopResolver()
    pending.clear()
    candidates.clear()
    visible.clear()
    emit(snapshot("idle", ""))
  }
  fun networkChanged() {
    if (!running) return
    generation += 1
    candidates.clear()
    visible.clear()
    pending.clear()
    stopBrowser()
    stopResolver()
    emit(snapshot("searching", "Network changed"))
    begin()
  }
  private fun stopBrowser() {
    val listener = browser ?: return
    browser = null
    try { nsd.stopServiceDiscovery(listener) }
    catch (failure: IllegalArgumentException) { emit(snapshot("unavailable", "NSD cleanup ${failure.javaClass.simpleName}")) }
  }
  private fun begin() {
    val epoch = generation
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(type: String) { handler.post { if (running && epoch == generation) emit(snapshot("searching", "")) } }
      override fun onDiscoveryStopped(type: String) {}
      override fun onStartDiscoveryFailed(type: String, code: Int) { NativeLog.warn(SCOPE, "nsd.start_failed") { mapOf("nsdCode" to code) }; handler.post { if (epoch == generation) { browser = null; emit(snapshot("unavailable", "NSD error $code")) } } }
      override fun onStopDiscoveryFailed(type: String, code: Int) { NativeLog.warn(SCOPE, "nsd.stop_failed") { mapOf("nsdCode" to code) }; handler.post { if (epoch == generation) emit(snapshot("unavailable", "NSD cleanup error $code")) } }
      override fun onServiceFound(service: NsdServiceInfo) { handler.post {
        if (running && epoch == generation) {
          visible.add(service.serviceName)
          if (pending.none { it.serviceName == service.serviceName }) pending.add(service)
          resolveNext(epoch)
        }
      } }
      override fun onServiceLost(service: NsdServiceInfo) { handler.post {
        if (running && epoch == generation) { visible.remove(service.serviceName); pending.removeAll { it.serviceName == service.serviceName }; candidates.remove(service.serviceName); emit(snapshot("searching", "")) }
      } }
    }
    browser = listener
    try { nsd.discoverServices(SERVICE, NsdManager.PROTOCOL_DNS_SD, listener) }
    catch (failure: SecurityException) { browser = null; emit(snapshot("permission-required", "Local network access was denied")) }
  }
  private fun stopResolver() {
    val listener = resolver ?: return
    resolver = null
    if (Build.VERSION.SDK_INT >= 34) {
      try { nsd.stopServiceResolution(listener) }
      catch (failure: IllegalArgumentException) { emit(snapshot("unavailable", "NSD resolution cleanup ${failure.javaClass.simpleName}")) }
    }
  }
  @Suppress("DEPRECATION")
  private fun resolveNext(epoch: Long) {
    if (resolver != null || pending.isEmpty() || !running || epoch != generation) return
    val service = pending.removeFirst()
    val listener = object : NsdManager.ResolveListener {
      override fun onResolveFailed(info: NsdServiceInfo, code: Int) { NativeLog.debug(SCOPE, "nsd.resolve_failed") { mapOf("nsdCode" to code) }; handler.post { finished(this) } }
      override fun onResolutionStopped(info: NsdServiceInfo) { handler.post { finished(this) } }
      override fun onServiceResolved(info: NsdServiceInfo) { handler.post {
        if (resolver !== this) return@post
        if (running && epoch == generation && visible.contains(info.serviceName)) resolved(info)
        finished(this)
      } }
    }
    resolver = listener
    try { nsd.resolveService(service, listener) }
    catch (failure: SecurityException) {
      resolver = null
      emit(snapshot("permission-required", "Local network resolution was denied"))
    }
  }
  private fun finished(listener: NsdManager.ResolveListener) {
    if (resolver !== listener) return
    resolver = null
    resolveNext(generation)
  }
  @Suppress("DEPRECATION")
  private fun resolved(info: NsdServiceInfo) {
    val address = info.host?.hostAddress ?: return
    if (address.contains('%') || info.port !in 1..65535) return
    val host = if (address.contains(':')) "[$address]" else address
    val id = info.attributes["id"]?.toString(Charsets.UTF_8) ?: return
    val protocol = info.attributes["protocol"]?.toString(Charsets.UTF_8)?.toIntOrNull()
    val tls = info.attributes["tls"]?.toString(Charsets.UTF_8)
    if (tls != "1" || protocol != 1 || !Regex("[0-9a-f]{64}").matches(id)) {
      NativeLog.debug(SCOPE, "candidate.ignored") { mapOf("tls" to tls, "protocol" to protocol, "idValid" to Regex("[0-9a-f]{64}").matches(id)) }
      return
    }
    candidates[info.serviceName] = HubCandidate(info.serviceName.take(63), "https://$host:${info.port}", id, protocol)
    NativeLog.debug(SCOPE, "candidate.resolved") { mapOf("hubId" to id.take(8), "port" to info.port, "ipv6" to address.contains(':'), "candidates" to candidates.size) }
    emit(snapshot("searching", ""))
  }
  private fun snapshot(nextState: String, nextDetail: String): HubDiscoverySnapshot {
    val changed = state != nextState || detail != nextDetail
    state = nextState
    detail = nextDetail
    if (changed) NativeLog.info(SCOPE, "discovery.state") { mapOf("generation" to generation, "state" to nextState, "detail" to nextDetail, "candidates" to candidates.size) }
    published = HubDiscoverySnapshot(generation, state, detail, candidates.values.toList())
    return published
  }
  companion object { private const val SERVICE = "_smarteverything._tcp."; private const val WINDOW_MS = 30_000L; private const val SCOPE = "hub-discovery" }
}
