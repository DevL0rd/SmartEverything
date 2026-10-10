package expo.modules.healthconnect.phone

import android.content.Context
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Handler
import android.os.Looper
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

object PhoneFlashlight {
  private const val READ_TIMEOUT_MS = 1_000L

  fun set(context: Context, mode: String): PhoneActionResult {
    val manager = context.getSystemService(CameraManager::class.java)
    val id = torchCamera(manager)
    val on = when (mode) {
      "on" -> true
      "off" -> false
      "toggle" -> !lit(manager, id)
      else -> throw PhoneFlashlightModeUnknown(mode)
    }
    try {
      manager.setTorchMode(id, on)
    } catch (failure: CameraAccessException) {
      throw PhoneFlashlightRefused(failure)
    } catch (failure: IllegalArgumentException) {
      throw PhoneFlashlightRefused(failure)
    }
    return PhoneActionResult(true, if (on) "Flashlight on" else "Flashlight off")
  }

  private fun torchCamera(manager: CameraManager): String = manager.cameraIdList.firstOrNull { id ->
    val characteristics = manager.getCameraCharacteristics(id)
    characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true &&
      characteristics.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
  } ?: throw PhoneFlashlightMissing()

  private fun lit(manager: CameraManager, id: String): Boolean {
    val read = CountDownLatch(1)
    var state = false
    val callback = object : CameraManager.TorchCallback() {
      override fun onTorchModeChanged(cameraId: String, enabled: Boolean) {
        if (cameraId == id) {
          state = enabled
          read.countDown()
        }
      }
    }
    manager.registerTorchCallback(callback, Handler(Looper.getMainLooper()))
    val answered = read.await(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS)
    manager.unregisterTorchCallback(callback)
    if (!answered) throw PhoneFlashlightUnreadable()
    return state
  }
}
