package expo.modules.healthconnect.phone

import android.app.usage.NetworkStatsManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.provider.Settings
import android.telephony.SignalStrength
import android.telephony.TelephonyCallback
import android.telephony.TelephonyDisplayInfo
import android.telephony.TelephonyManager
import androidx.annotation.RequiresApi
import java.time.LocalDate
import java.time.ZoneId
import org.json.JSONObject

object PhoneSignal : PhoneDetailSource {
  private const val MHZ_PER_GHZ = 1000.0
  private const val BAND_STEP = 10.0
  private val BARS_FROM_DBM = listOf(-88, -77, -66, -55)
  private val RESTING_DBM = listOf(-100, -88, -77, -66, -55)

  override val sections = setOf(PhoneSection.NETWORK)

  private val dataUse = SlowReading<Any>()
  private var liveReceiver: BroadcastReceiver? = null
  private var liveNetwork: ConnectivityManager.NetworkCallback? = null
  private var liveTelephony: PhoneTelephonyLive? = null

  fun barsOf(dbm: Int): Int = BARS_FROM_DBM.count { dbm >= it }

  fun reportedDbm(dbm: Int, live: Boolean): Int = if (live) dbm else RESTING_DBM[barsOf(dbm)]

  fun generationOf(dataType: Int, override: Int): String? {
    val fifthGeneration = dataType == TelephonyManager.NETWORK_TYPE_NR ||
      override == TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA ||
      override == TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_ADVANCED
    return when {
      fifthGeneration -> "5g"
      dataType == TelephonyManager.NETWORK_TYPE_LTE -> "4g"
      dataType in THIRD_GENERATION -> "3g"
      dataType in SECOND_GENERATION -> "2g"
      else -> null
    }
  }

  fun bandGhz(megahertz: Int): Double = Math.round(megahertz / MHZ_PER_GHZ * BAND_STEP) / BAND_STEP

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> {
    val bars = activeBars(context) ?: return emptyMap()
    return mapOf("signal_strength" to bars)
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject {
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val capabilities = connectivity.activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
    return body(
      PhoneReadings.networkKind(capabilities),
      wifi(context, capabilities, request.live),
      cellular(context),
      capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN) == false,
      capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false,
      Settings.Global.getInt(context.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1,
      dataUse.read(request.slow || request.live) { data(context) }
    )
  }

  fun body(kind: String, wifi: JSONObject?, cellular: JSONObject?, vpn: Boolean, metered: Boolean, airplane: Boolean, data: Any): JSONObject = JSONObject()
    .put("kind", kind)
    .put("wifi", wifi ?: JSONObject.NULL)
    .put("cellular", cellular ?: JSONObject.NULL)
    .put("vpn", vpn)
    .put("metered", metered)
    .put("airplane", airplane)
    .put("data", data)

  fun wifiBody(ssid: String?, rssiDbm: Int, bars: Int, linkMbps: Int, bandGhz: Double): JSONObject = JSONObject()
    .put("ssid", ssid ?: JSONObject.NULL)
    .put("rssiDbm", rssiDbm)
    .put("bars", bars)
    .put("linkMbps", linkMbps)
    .put("bandGhz", bandGhz)

  fun cellularBody(bars: Int, generation: String, operator: String?): JSONObject = JSONObject()
    .put("bars", bars)
    .put("generation", generation)
    .put("operator", operator ?: JSONObject.NULL)

  fun dataBody(todayWifi: Long, todayMobile: Long, monthWifi: Long, monthMobile: Long): JSONObject = JSONObject()
    .put("today", JSONObject().put("wifiBytes", todayWifi).put("mobileBytes", todayMobile))
    .put("month", JSONObject().put("wifiBytes", monthWifi).put("mobileBytes", monthMobile))

  override fun startLive(context: Context) {
    val changed = { PhoneReporter.report(context) }
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = changed()
    }
    context.registerReceiver(receiver, IntentFilter(WifiManager.RSSI_CHANGED_ACTION), Context.RECEIVER_NOT_EXPORTED)
    liveReceiver = receiver
    val callback = PhoneDefaultNetworkWatch(changed)
    context.getSystemService(ConnectivityManager::class.java).registerDefaultNetworkCallback(callback)
    liveNetwork = callback
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && PhoneFeatures.phoneStateAllowed(context)) {
      liveTelephony = PhoneTelephonyLive(changed).also { it.start(context) }
    }
  }

  override fun stopLive(context: Context) {
    liveReceiver?.let { context.unregisterReceiver(it) }
    liveNetwork?.let { context.getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
    liveTelephony?.stop(context)
    liveReceiver = null
    liveNetwork = null
    liveTelephony = null
  }

  private fun activeBars(context: Context): Int? {
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val capabilities = connectivity.activeNetwork?.let { connectivity.getNetworkCapabilities(it) }
    return when (PhoneReadings.networkKind(capabilities)) {
      "wifi" -> wifi(context, capabilities, false)?.getInt("bars")
      "cellular" -> cellular(context)?.getInt("bars")
      "offline" -> 0
      else -> null
    }
  }

  private fun wifi(context: Context, capabilities: NetworkCapabilities?, live: Boolean): JSONObject? {
    if (capabilities == null || !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
      return null
    }
    @Suppress("DEPRECATION")
    val info = context.getSystemService(WifiManager::class.java).connectionInfo ?: return null
    return wifiBody(
      PhoneNetwork.currentSsid(context),
      reportedDbm(info.rssi, live),
      barsOf(info.rssi),
      info.linkSpeed.coerceAtLeast(0),
      bandGhz(info.frequency.coerceAtLeast(0))
    )
  }

  private fun cellular(context: Context): JSONObject? {
    if (!PhoneFeatures.phoneStateAllowed(context)) {
      return null
    }
    val telephony = context.getSystemService(TelephonyManager::class.java)
    val generation = generationOf(telephony.dataNetworkType, liveTelephony?.override ?: TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE) ?: return null
    val bars = telephony.signalStrength?.level ?: return null
    return cellularBody(bars, generation, telephony.networkOperatorName.takeIf(String::isNotBlank))
  }

  private fun data(context: Context): Any {
    if (!PhoneReadings.usageAllowed(context) || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return JSONObject.NULL
    }
    val stats = context.getSystemService(NetworkStatsManager::class.java)
    val now = System.currentTimeMillis()
    val zone = ZoneId.systemDefault()
    val today = LocalDate.now()
    val dayStart = today.atStartOfDay(zone).toInstant().toEpochMilli()
    val monthStart = today.withDayOfMonth(1).atStartOfDay(zone).toInstant().toEpochMilli()
    return dataBody(
      bytes(stats, ConnectivityManager.TYPE_WIFI, dayStart, now),
      bytes(stats, ConnectivityManager.TYPE_MOBILE, dayStart, now),
      bytes(stats, ConnectivityManager.TYPE_WIFI, monthStart, now),
      bytes(stats, ConnectivityManager.TYPE_MOBILE, monthStart, now)
    )
  }

  private fun bytes(stats: NetworkStatsManager, type: Int, start: Long, end: Long): Long {
    val bucket = stats.querySummaryForDevice(type, null, start, end)
    return bucket.rxBytes + bucket.txBytes
  }

  private val THIRD_GENERATION = setOf(
    TelephonyManager.NETWORK_TYPE_UMTS,
    TelephonyManager.NETWORK_TYPE_HSDPA,
    TelephonyManager.NETWORK_TYPE_HSUPA,
    TelephonyManager.NETWORK_TYPE_HSPA,
    TelephonyManager.NETWORK_TYPE_HSPAP,
    TelephonyManager.NETWORK_TYPE_EVDO_0,
    TelephonyManager.NETWORK_TYPE_EVDO_A,
    TelephonyManager.NETWORK_TYPE_EVDO_B,
    TelephonyManager.NETWORK_TYPE_EHRPD,
    TelephonyManager.NETWORK_TYPE_TD_SCDMA
  )
  private val SECOND_GENERATION = setOf(
    TelephonyManager.NETWORK_TYPE_GPRS,
    TelephonyManager.NETWORK_TYPE_EDGE,
    TelephonyManager.NETWORK_TYPE_CDMA,
    TelephonyManager.NETWORK_TYPE_1xRTT,
    TelephonyManager.NETWORK_TYPE_IDEN,
    TelephonyManager.NETWORK_TYPE_GSM
  )
}

class PhoneDefaultNetworkWatch(private val changed: () -> Unit) : ConnectivityManager.NetworkCallback() {
  @Volatile
  private var shape: List<Any>? = null

  fun shapeChanged(next: List<Any>): Boolean {
    if (next == shape) return false
    shape = next
    return true
  }

  override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
    val next = listOf(
      PhoneReadings.networkKind(capabilities),
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED),
      capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
    )
    if (shapeChanged(next)) changed()
  }
}

@RequiresApi(Build.VERSION_CODES.S)
class PhoneTelephonyLive(private val changed: () -> Unit) :
  TelephonyCallback(),
  TelephonyCallback.DisplayInfoListener,
  TelephonyCallback.SignalStrengthsListener {
  @Volatile
  var override = TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE
    private set

  override fun onDisplayInfoChanged(telephonyDisplayInfo: TelephonyDisplayInfo) {
    override = telephonyDisplayInfo.overrideNetworkType
    changed()
  }

  override fun onSignalStrengthsChanged(signalStrength: SignalStrength) = changed()

  fun start(context: Context) = context.getSystemService(TelephonyManager::class.java).registerTelephonyCallback(context.mainExecutor, this)

  fun stop(context: Context) = context.getSystemService(TelephonyManager::class.java).unregisterTelephonyCallback(this)
}
