package expo.modules.healthconnect.diagnostics

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Debug
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.system.Os
import android.system.OsConstants
import java.io.File

object PerfSnapshot {
  private const val KILOBYTE = 1024.0
  private const val UTIME_FIELD = 11
  private const val STIME_FIELD = 12

  private fun ticksOf(stat: String): Long {
    val fields = stat.substring(stat.lastIndexOf(')') + 2).split(' ')
    return (fields.getOrNull(UTIME_FIELD)?.toLongOrNull() ?: 0L) +
      (fields.getOrNull(STIME_FIELD)?.toLongOrNull() ?: 0L)
  }

  private fun nameOf(stat: String): String =
    stat.substring(stat.indexOf('(') + 1, stat.lastIndexOf(')'))

  private fun threadTicks(): Map<String, Double> {
    val ticks = HashMap<String, Double>()
    File("/proc/self/task").listFiles()?.forEach { task ->
      val stat = runCatching { File(task, "stat").readText() }.getOrNull() ?: return@forEach
      val name = nameOf(stat)
      ticks[name] = (ticks[name] ?: 0.0) + ticksOf(stat).toDouble()
    }
    return ticks
  }

  private fun rssKb(): Double {
    val pages = File("/proc/self/statm").readText().trim().split(' ').getOrNull(1)?.toLongOrNull() ?: 0L
    return pages * Os.sysconf(OsConstants._SC_PAGESIZE) / KILOBYTE
  }

  private fun memory(): Map<String, Double> {
    val info = Debug.MemoryInfo()
    Debug.getMemoryInfo(info)
    fun stat(name: String): Double = info.getMemoryStat(name)?.toDoubleOrNull() ?: 0.0
    return mapOf(
      "rssKb" to rssKb(),
      "pssKb" to info.totalPss.toDouble(),
      "javaHeapKb" to stat("summary.java-heap"),
      "nativeHeapKb" to stat("summary.native-heap"),
      "graphicsKb" to stat("summary.graphics"),
      "codeKb" to stat("summary.code"),
      "nativeAllocatedKb" to Debug.getNativeHeapAllocatedSize() / KILOBYTE
    )
  }

  private fun power(context: Context): Map<String, Double> {
    val battery = context.getSystemService(BatteryManager::class.java)
    val sticky = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
    val thermal = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      context.getSystemService(PowerManager::class.java).currentThermalStatus.toDouble()
    } else {
      -1.0
    }
    return mapOf(
      "batteryUa" to battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CURRENT_NOW).toDouble(),
      "batteryPct" to battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).toDouble(),
      "batteryTempC" to (sticky?.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) ?: 0) / 10.0,
      "thermal" to thermal
    )
  }

  fun read(context: Context): Map<String, Any> = mapOf(
    "memory" to memory(),
    "power" to power(context),
    "threads" to threadTicks(),
    "processTicks" to ticksOf(File("/proc/self/stat").readText()).toDouble(),
    "ticksPerSecond" to Os.sysconf(OsConstants._SC_CLK_TCK).toDouble(),
    "uptimeMs" to SystemClock.uptimeMillis().toDouble(),
    "frames" to FrameStats.take()
  )

  fun processTimes(): Map<String, Double> = mapOf(
    "startUptimeMs" to Process.getStartUptimeMillis().toDouble(),
    "nowUptimeMs" to SystemClock.uptimeMillis().toDouble()
  )
}
