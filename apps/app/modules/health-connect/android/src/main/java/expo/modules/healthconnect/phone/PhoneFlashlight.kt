package expo.modules.healthconnect.phone

import android.content.Context
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object PhoneFlashlight {
  private const val READ_TIMEOUT_MS = 1_000L
  private const val PERCENT = 100

  private class Watch(val manager: CameraManager, val id: String, val callback: CameraManager.TorchCallback)

  @Volatile private var watch: Watch? = null
  @Volatile private var lit: Boolean? = null
  @Volatile private var known = CountDownLatch(1)

  fun levelFor(percent: Int, maxLevel: Int): Int =
    ((percent.coerceIn(1, PERCENT) * maxLevel + PERCENT - 1) / PERCENT).coerceIn(1, maxLevel)

  fun observe(context: Context) {
    synchronized(this) {
      if (watch != null) return
      val manager = context.getSystemService(CameraManager::class.java)
      val id = torchCamera(manager) ?: return
      val app = context.applicationContext
      known = CountDownLatch(1)
      val callback = object : CameraManager.TorchCallback() {
        override fun onTorchModeChanged(cameraId: String, enabled: Boolean) {
          if (cameraId != id) return
          lit = enabled
          known.countDown()
          PhoneReporter.report(app)
        }
      }
      manager.registerTorchCallback(callback, Handler(Looper.getMainLooper()))
      watch = Watch(manager, id, callback)
    }
  }

  fun stop() {
    synchronized(this) {
      watch?.let { it.manager.unregisterTorchCallback(it.callback) }
      watch = null
      lit = null
    }
  }

  fun available(context: Context): Boolean = torchCamera(context.getSystemService(CameraManager::class.java)) != null

  fun state(context: Context): String? {
    observe(context)
    return lit?.let { if (it) "on" else "off" }
  }

  fun maxLevel(context: Context): Int {
    val manager = context.getSystemService(CameraManager::class.java)
    val id = torchCamera(manager) ?: return 0
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return 1
    return manager.getCameraCharacteristics(id).get(CameraCharacteristics.FLASH_INFO_STRENGTH_MAXIMUM_LEVEL) ?: 1
  }

  fun set(context: Context, mode: String): PhoneActionResult {
    val target = target(context)
    val on = when (mode) {
      "on" -> true
      "off" -> false
      "toggle" -> !current()
      else -> throw PhoneFlashlightModeUnknown(mode)
    }
    refusing { target.manager.setTorchMode(target.id, on) }
    return PhoneActionResult(true, if (on) "Flashlight on" else "Flashlight off")
  }

  fun setLevel(context: Context, percent: Int): PhoneActionResult {
    val target = target(context)
    val max = maxLevel(context)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || max <= 1) throw PhoneFlashlightStrengthFixed()
    val level = levelFor(percent, max)
    refusing { target.manager.turnOnTorchWithStrengthLevel(target.id, level) }
    return PhoneActionResult(true, "Flashlight at $percent%")
  }

  private fun target(context: Context): Watch {
    observe(context)
    return watch ?: throw PhoneFlashlightMissing()
  }

  private fun current(): Boolean {
    if (!known.await(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)) throw PhoneFlashlightUnreadable()
    return lit == true
  }

  private fun refusing(change: () -> Unit) {
    try {
      change()
    } catch (failure: CameraAccessException) {
      throw PhoneFlashlightRefused(failure)
    } catch (failure: IllegalArgumentException) {
      throw PhoneFlashlightRefused(failure)
    }
  }

  private fun torchCamera(manager: CameraManager): String? = manager.cameraIdList.firstOrNull { id ->
    val characteristics = manager.getCameraCharacteristics(id)
    characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
      characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
  }
}
