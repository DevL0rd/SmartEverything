package expo.modules.healthconnect.phone

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import androidx.annotation.RequiresApi
import android.provider.Settings
import android.util.Base64
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import expo.modules.healthconnect.NativeGuard
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PhoneAccessibilityService : AccessibilityService() {
  override fun onServiceConnected() {
    super.onServiceConnected()
    PhoneAccessibility.connected(this)
    NativeGuard.run("PhoneAccessibilityService") { PhoneReporter.report(applicationContext) }
  }

  override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit

  override fun onInterrupt() = Unit

  override fun onUnbind(intent: Intent?): Boolean {
    PhoneAccessibility.disconnected(this)
    NativeGuard.run("PhoneAccessibilityService") { PhoneReporter.report(applicationContext) }
    return super.onUnbind(intent)
  }
}

object PhoneAccessibility {
  private const val LONG_EDGE = 1280
  private const val JPEG_QUALITY = 70
  private const val SHOT_TIMEOUT_SECONDS = 10L
  private val executor = Executors.newSingleThreadExecutor()

  @Volatile private var service: PhoneAccessibilityService? = null

  fun connected(active: PhoneAccessibilityService) {
    service = active
  }

  fun disconnected(inactive: PhoneAccessibilityService) {
    if (service === inactive) service = null
  }

  fun enabled(context: Context): Boolean {
    val listed = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
    val me = ComponentName(context, PhoneAccessibilityService::class.java)
    return listed.split(':').any { it == me.flattenToString() || it == me.flattenToShortString() }
  }

  private fun running(context: Context): PhoneAccessibilityService {
    if (!enabled(context)) throw PhoneAccessibilityOff()
    return service ?: throw PhoneAccessibilityNotConnected()
  }

  @RequiresApi(Build.VERSION_CODES.P)
  fun lock(context: Context): PhoneActionResult {
    if (!running(context).performGlobalAction(AccessibilityService.GLOBAL_ACTION_LOCK_SCREEN)) {
      throw PhoneLockRefused()
    }
    return PhoneActionResult(true, "Locked")
  }

  @RequiresApi(Build.VERSION_CODES.R)
  fun screenshot(context: Context): PhoneActionResult {
    val active = running(context)
    val taken = CountDownLatch(1)
    var result: AccessibilityService.ScreenshotResult? = null
    var failure = 0
    active.takeScreenshot(Display.DEFAULT_DISPLAY, executor, object : AccessibilityService.TakeScreenshotCallback {
      override fun onSuccess(screenshot: AccessibilityService.ScreenshotResult) {
        result = screenshot
        taken.countDown()
      }

      override fun onFailure(errorCode: Int) {
        failure = errorCode
        taken.countDown()
      }
    })
    if (!taken.await(SHOT_TIMEOUT_SECONDS, TimeUnit.SECONDS)) throw PhoneScreenshotTimedOut(SHOT_TIMEOUT_SECONDS)
    val shot = result ?: throw PhoneScreenshotFailed(failure)
    return PhoneActionResult(true, "Took a screenshot", encoded(shot))
  }

  @RequiresApi(Build.VERSION_CODES.R)
  private fun encoded(shot: AccessibilityService.ScreenshotResult): String {
    val hardware = Bitmap.wrapHardwareBuffer(shot.hardwareBuffer, shot.colorSpace) ?: throw PhoneScreenshotFailed(0)
    try {
      val software = hardware.copy(Bitmap.Config.ARGB_8888, false)
      val scale = LONG_EDGE.toFloat() / maxOf(software.width, software.height)
      val picture = if (scale < 1f) {
        Bitmap.createScaledBitmap(software, (software.width * scale).toInt(), (software.height * scale).toInt(), true)
      } else {
        software
      }
      val bytes = ByteArrayOutputStream()
      picture.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, bytes)
      return Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
    } finally {
      shot.hardwareBuffer.close()
    }
  }
}
