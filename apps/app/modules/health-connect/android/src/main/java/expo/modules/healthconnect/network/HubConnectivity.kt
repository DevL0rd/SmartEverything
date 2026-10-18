package expo.modules.healthconnect.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import expo.modules.healthconnect.diagnostics.NativeLog

class HubConnectivity(context: Context, private val changed: () -> Unit, private val emit: (Map<String, Any?>) -> Unit = {}) {
  private val manager = context.getSystemService(ConnectivityManager::class.java)
  private val handler = Handler(Looper.getMainLooper())
  private var registered = false
  private var generation = 0L
  private var defaultNetwork: Network? = null
  private val callback = object : ConnectivityManager.NetworkCallback() {
    override fun onAvailable(network: Network) {
      handler.post { switched(network) }
    }

    override fun onLost(network: Network) {
      handler.post { lost(network) }
    }
  }

  fun start(): Map<String, Any?> {
    if (registered) return snapshot("watching", "")
    return try {
      manager.registerDefaultNetworkCallback(callback)
      registered = true
      NativeLog.info(SCOPE, "watch.started") { mapOf("generation" to generation) }
      snapshot("watching", "")
    } catch (failure: SecurityException) {
      NativeLog.warn(SCOPE, "watch.denied", failure)
      snapshot("unavailable", "Network state permission denied")
    }
  }

  fun stop() {
    if (registered) {
      manager.unregisterNetworkCallback(callback)
      NativeLog.info(SCOPE, "watch.stopped") { mapOf("generation" to generation) }
    }
    registered = false
    defaultNetwork = null
    handler.removeCallbacksAndMessages(null)
  }

  private fun switched(network: Network) {
    if (!registered || network == defaultNetwork) return
    NativeLog.info(SCOPE, "network.switched") { describe(network, "available") }
    defaultNetwork = network
    signal()
  }

  private fun lost(network: Network) {
    if (!registered || network != defaultNetwork) return
    NativeLog.info(SCOPE, "network.lost") { describe(network, "lost") }
    defaultNetwork = null
    signal()
  }

  private fun describe(network: Network, change: String): Map<String, Any?> {
    val capabilities = try { manager.getNetworkCapabilities(network) } catch (failure: SecurityException) { null }
    return mapOf(
      "change" to change,
      "handle" to network.toString(),
      "generation" to generation,
      "wifi" to capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI),
      "cellular" to capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
      "vpn" to capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN),
      "validated" to capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
    )
  }

  private fun signal() {
    generation += 1
    changed()
    emit(snapshot("watching", "Network changed"))
  }

  private companion object {
    const val SCOPE = "hub-network"
  }

  private fun snapshot(state: String, detail: String): Map<String, Any?> =
    mapOf("generation" to generation, "state" to state, "detail" to detail)
}
