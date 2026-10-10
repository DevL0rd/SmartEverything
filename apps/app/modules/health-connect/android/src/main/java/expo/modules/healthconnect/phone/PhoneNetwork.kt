package expo.modules.healthconnect.phone

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager

object PhoneNetwork {
  const val HOME = "Home"
  private const val REQUEST_CODE = 7503
  private const val UNKNOWN_SSID = "<unknown ssid>"

  fun register(context: Context) {
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    connectivity.unregisterNetworkCallback(pendingIntent(context))
    if (!PhoneStore(context).enabled()) {
      return
    }
    val request = NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build()
    connectivity.registerNetworkCallback(request, pendingIntent(context))
  }

  fun stop(context: Context) {
    context.getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(pendingIntent(context))
  }

  fun currentSsid(context: Context): String? {
    if (!PhonePermissions.location(context)) {
      return null
    }
    @Suppress("DEPRECATION")
    val ssid = context.getSystemService(WifiManager::class.java).connectionInfo?.ssid?.trim('"')
    return ssid?.takeIf { it.isNotEmpty() && it != UNKNOWN_SSID }
  }

  fun changed(context: Context) {
    val home = PhoneStore(context).homeWifi()
    if (home != null) {
      val atHome = currentSsid(context) == home
      val wasHome = PhoneStore(context).context().place == HOME
      if (atHome != wasHome) {
        PhoneContextInputs.feed(context, ContextInput.Place(HOME, atHome))
        return
      }
    }
    PhoneReporter.report(context)
  }

  private fun pendingIntent(context: Context): PendingIntent = PendingIntent.getBroadcast(
    context,
    REQUEST_CODE,
    Intent(context, PhoneNetworkReceiver::class.java),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
  )
}

class PhoneNetworkReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) = PhoneNetwork.changed(context)
}
