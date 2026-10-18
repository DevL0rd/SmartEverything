package expo.modules.healthconnect.listening

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.os.BatteryManager
import android.os.PowerManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class PowerSources(
  private val context: Context,
  mode: PowerMode,
  private val power: ListeningPower,
  scope: CoroutineScope
) : AutoCloseable {
  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      when (intent.action) {
        Intent.ACTION_SCREEN_ON -> power.screen(true)
        Intent.ACTION_SCREEN_OFF -> power.screen(false)
        Intent.ACTION_POWER_CONNECTED -> power.charging(true)
        Intent.ACTION_POWER_DISCONNECTED -> power.charging(false)
      }
    }
  }
  private val actions = actionsOf(mode)
  private var network: HomeNetworkWatch? = null
  private var home: Job? = null

  init {
    if (actions.isNotEmpty()) {
      context.registerReceiver(receiver, IntentFilter().apply { actions.forEach(::addAction) })
      syncReceivers()
    }
    if (mode == PowerMode.AwayFromHome) {
      network = HomeNetworkWatch(context).also { it.start() }
      home = scope.launch { HomeNetwork.reachable.collect { power.home(it) } }
    }
  }

  override fun close() {
    home?.cancel()
    network?.stop()
    if (actions.isNotEmpty()) {
      context.unregisterReceiver(receiver)
    }
  }

  private fun syncReceivers() {
    power.screen(snapshotScreen(context))
    power.charging(snapshotCharging(context))
  }

  companion object {
    fun snapshot(context: Context): PowerState =
      PowerState(snapshotScreen(context), snapshotCharging(context), HomeNetwork.reachable.value)

    private fun snapshotScreen(context: Context): Boolean =
      context.getSystemService(PowerManager::class.java).isInteractive

    private fun snapshotCharging(context: Context): Boolean =
      context.getSystemService(BatteryManager::class.java).isCharging

    private fun actionsOf(mode: PowerMode): List<String> = when (mode) {
      PowerMode.ScreenOn -> listOf(Intent.ACTION_SCREEN_ON, Intent.ACTION_SCREEN_OFF)
      PowerMode.Charging -> listOf(Intent.ACTION_POWER_CONNECTED, Intent.ACTION_POWER_DISCONNECTED)
      PowerMode.Always, PowerMode.AwayFromHome -> emptyList()
    }
  }
}

class DefaultNetworkTracker<N>(private val changed: () -> Unit) {
  private var known: N? = null
  private var seen = false

  @Synchronized
  fun available(network: N) {
    val moved = seen && network != known
    seen = true
    known = network
    if (moved) {
      changed()
    }
  }

  @Synchronized
  fun lost(network: N) {
    if (network == known) {
      known = null
      changed()
    }
  }
}

class HomeNetworkWatch(private val context: Context) : ConnectivityManager.NetworkCallback() {
  private val tracker = DefaultNetworkTracker<Network> { HomeNetwork.set(false) }

  fun start() {
    context.getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(this)
  }

  fun stop() {
    context.getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(this)
  }

  override fun onAvailable(network: Network) = tracker.available(network)

  override fun onLost(network: Network) = tracker.lost(network)
}
