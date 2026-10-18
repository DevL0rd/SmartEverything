package expo.modules.healthconnect.phone

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import expo.modules.healthconnect.NativeGuard
import java.time.Instant
import org.json.JSONObject

class PowerReading(
  val voltageMv: Int,
  val temperatureC: Double,
  val health: Int,
  val plugged: Int,
  val cycles: Int
)

object PhonePower : PhoneDetailSource {
  private const val TENTH = 10.0
  private const val MICRO_PER_MILLI = 1000
  private const val VOLTAGE_REST_STEP = 100
  private const val FULL_AT_REST_STEP_MS = 900_000L
  private const val FULL_AT_LIVE_STEP_MS = 60_000L
  private const val TEMPERATURE_REST_STEP = 1.0
  private const val TEMPERATURE_LIVE_STEP = 0.5
  private const val NO_CYCLES = -1

  override val sections = setOf(PhoneSection.POWER)

  private val memoryReading = SlowReading<JSONObject>()
  private var liveReceiver: BroadcastReceiver? = null
  private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null

  fun chargerOf(plugged: Int): String = when {
    plugged and BatteryManager.BATTERY_PLUGGED_WIRELESS != 0 -> "wireless"
    plugged and BatteryManager.BATTERY_PLUGGED_DOCK != 0 -> "dock"
    plugged and BatteryManager.BATTERY_PLUGGED_AC != 0 -> "ac"
    plugged and BatteryManager.BATTERY_PLUGGED_USB != 0 -> "usb"
    else -> "none"
  }

  fun healthOf(health: Int): String = when (health) {
    BatteryManager.BATTERY_HEALTH_GOOD -> "good"
    BatteryManager.BATTERY_HEALTH_OVERHEAT -> "overheat"
    BatteryManager.BATTERY_HEALTH_DEAD -> "dead"
    BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE -> "over_voltage"
    BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE -> "failure"
    BatteryManager.BATTERY_HEALTH_COLD -> "cold"
    else -> "unknown"
  }

  fun thermalOf(status: Int): String = when (status) {
    PowerManager.THERMAL_STATUS_NONE -> "normal"
    PowerManager.THERMAL_STATUS_LIGHT -> "light"
    PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
    PowerManager.THERMAL_STATUS_SEVERE -> "severe"
    else -> "critical"
  }

  fun steppedTemperature(celsius: Double, live: Boolean): Double {
    val step = if (live) TEMPERATURE_LIVE_STEP else TEMPERATURE_REST_STEP
    return Math.round(celsius / step) * step
  }

  fun steppedMoment(epochMs: Long, live: Boolean): Instant {
    val step = if (live) FULL_AT_LIVE_STEP_MS else FULL_AT_REST_STEP_MS
    return Instant.ofEpochMilli((epochMs + step / 2) / step * step)
  }

  fun steppedVoltage(millivolts: Int, live: Boolean): Int = if (live) millivolts else (millivolts + VOLTAGE_REST_STEP / 2) / VOLTAGE_REST_STEP * VOLTAGE_REST_STEP

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> {
    val reading = read(context)
    val power = context.getSystemService(PowerManager::class.java)
    return buildMap {
      put("charger", chargerOf(reading.plugged))
      put("charge_full_at", fullAt(context, request.live)?.toString() ?: JSONObject.NULL)
      put("battery_temperature", steppedTemperature(reading.temperatureC, request.live))
      put("power_save", power.isPowerSaveMode)
      thermalState(context)?.let { put("thermal_state", it) }
    }
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? {
    val level = PhoneReadings.batteryLevel(context, request.live) ?: return null
    val reading = read(context)
    return JSONObject()
      .put("level", level)
      .put("voltageMv", steppedVoltage(reading.voltageMv, request.live))
      .put("currentMa", if (request.live) currentMa(context) else JSONObject.NULL)
      .put("temperatureC", steppedTemperature(reading.temperatureC, request.live))
      .put("health", healthOf(reading.health))
      .put("cycles", if (reading.cycles == NO_CYCLES) JSONObject.NULL else reading.cycles)
      .put("charger", chargerOf(reading.plugged))
      .put("fullAt", fullAt(context, request.live)?.toString() ?: JSONObject.NULL)
      .put("memory", memoryReading.read(request.slow || request.live) { memory(context) })
  }

  override fun startLive(context: Context) {
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("PhonePowerLive") { PhoneReporter.report(context) }
    }
    context.registerReceiver(receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED), Context.RECEIVER_NOT_EXPORTED)
    liveReceiver = receiver
  }

  override fun stopLive(context: Context) {
    liveReceiver?.let { context.unregisterReceiver(it) }
    liveReceiver = null
  }

  fun watch(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || thermalListener != null) {
      return
    }
    val listener = PowerManager.OnThermalStatusChangedListener { NativeGuard.run("PhoneThermal") { PhoneReporter.report(context) } }
    context.getSystemService(PowerManager::class.java).addThermalStatusListener(listener)
    thermalListener = listener
  }

  fun unwatch(context: Context) {
    thermalListener?.let { context.getSystemService(PowerManager::class.java).removeThermalStatusListener(it) }
    thermalListener = null
  }

  fun thermalState(context: Context): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      return null
    }
    return thermalOf(context.getSystemService(PowerManager::class.java).currentThermalStatus)
  }

  private fun read(context: Context): PowerReading {
    val sticky = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      ?: throw PhoneReadingUnavailable("the battery state", "Android returned no battery broadcast")
    return PowerReading(
      voltageMv = sticky.getIntExtra(BatteryManager.EXTRA_VOLTAGE, 0),
      temperatureC = sticky.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / TENTH,
      health = sticky.getIntExtra(BatteryManager.EXTRA_HEALTH, BatteryManager.BATTERY_HEALTH_UNKNOWN),
      plugged = sticky.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0),
      cycles = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) sticky.getIntExtra(BatteryManager.EXTRA_CYCLE_COUNT, NO_CYCLES) else NO_CYCLES
    )
  }

  private fun fullAt(context: Context, live: Boolean): Instant? {
    val battery = context.getSystemService(BatteryManager::class.java)
    if (!battery.isCharging || Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
      return null
    }
    val remaining = battery.computeChargeTimeRemaining()
    return if (remaining > 0) steppedMoment(System.currentTimeMillis() + remaining, live) else null
  }

  private fun currentMa(context: Context): Any {
    val micro = context.getSystemService(BatteryManager::class.java).getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW)
    return if (micro == Int.MIN_VALUE) JSONObject.NULL else micro / MICRO_PER_MILLI
  }

  private fun memory(context: Context): JSONObject {
    val info = ActivityManager.MemoryInfo()
    context.getSystemService(ActivityManager::class.java).getMemoryInfo(info)
    return JSONObject().put("totalBytes", info.totalMem).put("availableBytes", info.availMem)
  }
}
