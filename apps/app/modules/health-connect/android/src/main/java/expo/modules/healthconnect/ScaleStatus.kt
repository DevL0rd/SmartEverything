package expo.modules.healthconnect

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.healthconnect.diagnostics.NativeLog
import expo.modules.healthconnect.diagnostics.NativeTally
import java.time.Instant
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

open class NativeEventChannel {
  private val flow = MutableSharedFlow<Map<String, Any?>>(
    extraBufferCapacity = 64,
    onBufferOverflow = BufferOverflow.DROP_OLDEST
  )

  val events: SharedFlow<Map<String, Any?>> = flow

  fun emit(event: String, detail: String, extra: Map<String, Any?> = emptyMap()) {
    flow.tryEmit(extra + mapOf("event" to event, "detail" to detail, "at" to Instant.now().toString()))
  }
}

object ScaleEvents : NativeEventChannel()

class ScaleStatus(private val context: Context) {
  private val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)

  fun note(event: String, detail: String) {
    when (event) {
      "heard" -> HEARD_TALLY.add(0)
      "failed" -> NativeLog.warn(SCOPE, "ble.failed") { mapOf("detail" to NativeLog.reasonText(detail)) }
      else -> NativeLog.info(SCOPE, "ble.$event") { mapOf("detail" to NativeLog.reasonText(detail)) }
    }
    val now = Instant.now().toString()
    val editor = preferences.edit()
    when (event) {
      "registered" -> editor.putString(REGISTERED, now).remove(ERROR)
      "heard" -> editor.putString(HEARD, now)
      "uploaded" -> editor.putString(UPLOADED, now).remove(ERROR)
      "failed" -> editor.putString(ERROR, detail).putString(ERROR_AT, now)
    }
    editor.apply()
    ScaleEvents.emit(event, detail)
  }

  fun toMap(): Map<String, Any?> = mapOf(
    "permission" to permitted(context),
    "bluetooth" to bluetoothOn(context),
    "registeredAt" to preferences.getString(REGISTERED, null),
    "lastHeardAt" to preferences.getString(HEARD, null),
    "lastUploadedAt" to preferences.getString(UPLOADED, null),
    "lastError" to preferences.getString(ERROR, null),
    "lastErrorAt" to preferences.getString(ERROR_AT, null)
  )

  companion object {
    private const val SCOPE = "ble-sync"
    private val HEARD_TALLY = NativeTally(SCOPE, "adverts.summary")
    private const val PREFERENCES = "expo.modules.healthconnect.scale-status"
    private const val REGISTERED = "registeredAt"
    private const val HEARD = "lastHeardAt"
    private const val UPLOADED = "lastUploadedAt"
    private const val ERROR = "lastError"
    private const val ERROR_AT = "lastErrorAt"

    fun permitted(context: Context): Boolean {
      val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        Manifest.permission.BLUETOOTH_SCAN
      } else {
        Manifest.permission.ACCESS_FINE_LOCATION
      }
      return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    }

    fun bluetoothOn(context: Context): Boolean =
      context.getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled == true
  }
}
