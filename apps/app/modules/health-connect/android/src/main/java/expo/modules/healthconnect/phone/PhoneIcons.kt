package expo.modules.healthconnect.phone

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

object PhoneIcons {
  private const val PREFERENCES = "expo.modules.healthconnect.phone.icons"
  private const val HASH = "hash."
  private const val UPLOADED = "uploaded."
  private const val SIZE_PX = 48
  private const val QUALITY = 80
  private const val HEX_BYTE = "%02x"
  private const val ICONS_PATH = "/api/phone-icons"
  private val executor = Executors.newSingleThreadExecutor()
  private val running = AtomicBoolean(false)

  fun hashOf(bytes: ByteArray): String =
    MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { HEX_BYTE.format(it) }

  fun uploadBody(hash: String, bytes: ByteArray): JSONObject =
    JSONObject().put("hash", hash).put("webpBase64", Base64.getEncoder().encodeToString(bytes))

  fun hashFor(context: Context, packageName: String): String? =
    preferences(context).getString(HASH + packageName, null)?.substringAfter(VERSION_SEPARATOR)

  fun missing(context: Context, apps: List<LaunchableApp>): List<LaunchableApp> {
    val known = preferences(context)
    return apps.filter { known.getString(HASH + it.packageName, null)?.substringBefore(VERSION_SEPARATOR) != it.updatedAt.toString() }
  }

  fun sync(context: Context, apps: List<LaunchableApp>) {
    val app = context.applicationContext
    if (missing(app, apps).isEmpty() || !running.compareAndSet(false, true)) return
    executor.execute {
      try {
        val changed = missing(app, apps).count { publishing(app, it) }
        if (changed > 0) PhoneReporter.report(app, slow = true)
      } finally {
        running.set(false)
      }
    }
  }

  private fun publishing(context: Context, app: LaunchableApp): Boolean =
    PhoneGuard.run("the icon of ${app.packageName}") { publish(context, app) } ?: false

  private fun publish(context: Context, app: LaunchableApp): Boolean {
    val bytes = encode(context, app.packageName)
    val hash = hashOf(bytes)
    val known = preferences(context)
    known.edit().putString(HASH + app.packageName, app.updatedAt.toString() + VERSION_SEPARATOR + hash).apply()
    return known.getBoolean(UPLOADED + hash, false) || upload(context, hash, bytes)
  }

  fun uploaded(context: Context, hash: String) {
    preferences(context).edit().putBoolean(UPLOADED + hash, true).apply()
  }

  fun rejected(context: Context, hash: String) {
    val known = preferences(context)
    val edit = known.edit()
    known.all.filter { (key, value) -> key.startsWith(HASH) && (value as? String)?.substringAfter(VERSION_SEPARATOR) == hash }
      .keys.forEach { edit.remove(it) }
    edit.apply()
  }

  private fun upload(context: Context, hash: String, bytes: ByteArray): Boolean = try {
    WorkManager.getInstance(context).enqueueUniqueWork(
      "expo.modules.healthconnect.phone.icon.$hash",
      ExistingWorkPolicy.KEEP,
      PhonePostWorker.iconRequest(hash, ICONS_PATH, uploadBody(hash, bytes))
    )
    true
  } catch (failure: IllegalStateException) {
    PhoneEvents.emit("icon_not_queued", "The icon is too large to queue (${bytes.size} bytes): ${failure.message.orEmpty()}")
    false
  }

  private fun encode(context: Context, packageName: String): ByteArray {
    val bitmap = Bitmap.createBitmap(SIZE_PX, SIZE_PX, Bitmap.Config.ARGB_8888)
    val icon = context.packageManager.getApplicationIcon(packageName)
    icon.setBounds(0, 0, SIZE_PX, SIZE_PX)
    icon.draw(Canvas(bitmap))
    val out = ByteArrayOutputStream()
    @Suppress("DEPRECATION")
    val format = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Bitmap.CompressFormat.WEBP_LOSSY else Bitmap.CompressFormat.WEBP
    bitmap.compress(format, QUALITY, out)
    bitmap.recycle()
    return out.toByteArray()
  }

  private fun preferences(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  private const val VERSION_SEPARATOR = ":"
}
