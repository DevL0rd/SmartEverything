package expo.modules.healthconnect.phone

import android.app.usage.StorageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Process
import android.os.UserHandle
import android.os.storage.StorageManager
import expo.modules.healthconnect.NativeGuard
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class AppSize(val packageName: String, val label: String, val bytes: Long)

class StorageBreakdown(
  val appBytes: Long,
  val imageBytes: Long,
  val videoBytes: Long,
  val audioBytes: Long,
  val externalBytes: Long
)

object PhoneStorage : PhoneDetailSource {
  private const val LARGEST_APPS = 10

  override val sections = setOf(PhoneSection.STORAGE)

  private val scope = CoroutineScope(Dispatchers.IO)
  private val scanning = AtomicBoolean(false)

  @Volatile
  private var largest: List<AppSize> = emptyList()

  fun parts(total: Long, free: Long, breakdown: StorageBreakdown): List<Pair<String, Long>> {
    val other = (breakdown.externalBytes - breakdown.imageBytes - breakdown.videoBytes - breakdown.audioBytes).coerceAtLeast(0)
    val counted = breakdown.appBytes + breakdown.imageBytes + breakdown.videoBytes + breakdown.audioBytes + other
    val system = (total - free - counted).coerceAtLeast(0)
    return listOf(
      "apps" to breakdown.appBytes,
      "images" to breakdown.imageBytes,
      "video" to breakdown.videoBytes,
      "audio" to breakdown.audioBytes,
      "system" to system,
      "other" to other
    )
  }

  fun biggest(sizes: List<AppSize>): List<AppSize> = sizes.sortedByDescending { it.bytes }.take(LARGEST_APPS)

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> =
    if (request.slow) mapOf("storage_free" to stats(context).getFreeBytes(StorageManager.UUID_DEFAULT)) else emptyMap()

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject {
    val stats = stats(context)
    val total = stats.getTotalBytes(StorageManager.UUID_DEFAULT)
    val free = stats.getFreeBytes(StorageManager.UUID_DEFAULT)
    val usage = PhoneReadings.usageAllowed(context)
    if (usage && request.slow) {
      scan(context)
    }
    return if (usage) {
      body(total, free, parts(total, free, breakdown(stats)), largest)
    } else {
      body(total, free, emptyList(), emptyList())
    }
  }

  fun body(total: Long, free: Long, parts: List<Pair<String, Long>>, apps: List<AppSize>): JSONObject = JSONObject()
    .put("totalBytes", total)
    .put("freeBytes", free)
    .put("parts", JSONArray(parts.map { (kind, bytes) -> JSONObject().put("kind", kind).put("bytes", bytes) }))
    .put("apps", JSONArray(apps.map { JSONObject().put("package", it.packageName).put("label", it.label).put("bytes", it.bytes) }))

  private fun stats(context: Context): StorageStatsManager = context.getSystemService(StorageStatsManager::class.java)

  private fun breakdown(stats: StorageStatsManager): StorageBreakdown {
    val user = Process.myUserHandle()
    val external = stats.queryExternalStatsForUser(StorageManager.UUID_DEFAULT, user)
    val internal = stats.queryStatsForUser(StorageManager.UUID_DEFAULT, user)
    return StorageBreakdown(
      appBytes = internal.appBytes + internal.dataBytes + internal.cacheBytes,
      imageBytes = external.imageBytes,
      videoBytes = external.videoBytes,
      audioBytes = external.audioBytes,
      externalBytes = external.totalBytes
    )
  }

  private fun scan(context: Context) {
    if (!scanning.compareAndSet(false, true)) {
      return
    }
    val app = context.applicationContext
    scope.launch {
      try {
        NativeGuard.run("PhoneStorageScan") {
          largest = biggest(appSizes(app))
          PhoneReporter.report(app, slow = true)
        }
      } finally {
        scanning.set(false)
      }
    }
  }

  private fun appSizes(context: Context): List<AppSize> {
    val packages = context.packageManager
    val stats = stats(context)
    val user: UserHandle = Process.myUserHandle()
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
    return packages.queryIntentActivities(launcher, 0).map { it.activityInfo.packageName }.distinct().map { name ->
      val size = stats.queryStatsForPackage(StorageManager.UUID_DEFAULT, name, user)
      AppSize(name, packages.getApplicationLabel(packages.getApplicationInfo(name, 0)).toString(), size.appBytes + size.dataBytes + size.cacheBytes)
    }
  }
}
