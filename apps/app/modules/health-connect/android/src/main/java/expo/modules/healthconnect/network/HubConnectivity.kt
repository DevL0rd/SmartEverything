package expo.modules.healthconnect.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper

class HubConnectivity(context: Context, private val emit: (Map<String, Any?>) -> Unit, private val changed: () -> Unit) {
  private val manager = context.getSystemService(ConnectivityManager::class.java)
  private val handler = Handler(Looper.getMainLooper())
  private var registered = false
  private var generation = 0L
  private var signature = ""
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) { update() }
    override fun onLost(network: Network) { update() }
    override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) { update() }
    override fun onLinkPropertiesChanged(network: Network, properties: LinkProperties) { update() }
  }
  fun start(): Map<String, Any?> {
    if (registered) return snapshot("watching", "")
    return try {
      manager.registerDefaultNetworkCallback(callback)
      registered = true
      update()
      snapshot("watching", "")
    } catch (failure: SecurityException) {
      snapshot("unavailable", "Network state permission denied")
    }
  }
  fun stop() {
    if (registered) manager.unregisterNetworkCallback(callback)
    registered = false
    handler.removeCallbacksAndMessages(null)
  }
  private fun update() { handler.post {
    if (!registered) return@post
    val network = manager.activeNetwork
    val capabilities = manager.getNetworkCapabilities(network)
    val properties = manager.getLinkProperties(network)
    val transports = (0..7).filter { capabilities?.hasTransport(it) == true }
    val next = "$network:$transports:${properties?.interfaceName}:${properties?.linkAddresses}:${properties?.routes}:${properties?.dnsServers}"
    if (next != signature) {
      signature = next
      generation += 1
      changed()
      emit(snapshot("watching", "Network changed"))
    }
  } }
  private fun snapshot(state: String, detail: String): Map<String, Any?> = mapOf("generation" to generation, "state" to state, "detail" to detail)
}
