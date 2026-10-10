package expo.modules.healthconnect.assistant

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import org.json.JSONObject

class CallDevices(context: Context) {
  private val audio = context.getSystemService(AudioManager::class.java)

  fun inputs(): List<AudioDeviceInfo> =
    audio.getDevices(AudioManager.GET_DEVICES_INPUTS).filter { kindOf(it.type) != null }

  fun outputs(): List<AudioDeviceInfo> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audio.availableCommunicationDevices
    } else {
      audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { kindOf(it.type) != null }
    }

  fun input(id: String): AudioDeviceInfo? = inputs().firstOrNull { it.id.toString() == id }

  fun output(id: String): AudioDeviceInfo? = outputs().firstOrNull { it.id.toString() == id }

  fun outputOfType(type: Int): AudioDeviceInfo? = outputs().firstOrNull { it.type == type }

  fun outputAt(address: String): AudioDeviceInfo? =
    outputs().firstOrNull { it.address == address && kindOf(it.type) == BLUETOOTH }

  fun json(): String {
    val rows = JSONArray()
    inputs().forEach { rows.put(row(it, INPUT)) }
    outputs().forEach { rows.put(row(it, OUTPUT)) }
    return rows.toString()
  }

  fun watch(onChange: () -> Unit): AutoCloseable {
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = onChange()

      override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = onChange()
    }
    audio.registerAudioDeviceCallback(callback, Handler(Looper.getMainLooper()))
    return AutoCloseable { audio.unregisterAudioDeviceCallback(callback) }
  }

  private fun row(device: AudioDeviceInfo, direction: String): JSONObject = JSONObject()
    .put("id", device.id.toString())
    .put("direction", direction)
    .put("kind", kindOf(device.type) ?: OTHER)
    .put("name", device.productName.toString())

  companion object {
    const val INPUT = "input"
    const val OUTPUT = "output"
    const val BLUETOOTH = "bluetooth"
    private const val OTHER = "other"

    private val KINDS = mapOf(
      AudioDeviceInfo.TYPE_BUILTIN_MIC to "builtin",
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER to "speaker",
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE to "earpiece",
      AudioDeviceInfo.TYPE_WIRED_HEADSET to "wired",
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES to "wired",
      AudioDeviceInfo.TYPE_USB_HEADSET to "usb",
      AudioDeviceInfo.TYPE_USB_DEVICE to "usb",
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO to BLUETOOTH,
      AudioDeviceInfo.TYPE_BLE_HEADSET to BLUETOOTH,
      AudioDeviceInfo.TYPE_HEARING_AID to "hearing_aid"
    )

    fun kindOf(type: Int): String? = KINDS[type]
  }
}
