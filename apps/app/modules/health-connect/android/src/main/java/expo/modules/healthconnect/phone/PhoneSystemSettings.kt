package expo.modules.healthconnect.phone

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import expo.modules.healthconnect.NativeGuard

enum class SystemToggle(val wire: String, val key: String, val label: String) {
  AUTO_ROTATE("auto_rotate", Settings.System.ACCELEROMETER_ROTATION, "Auto-rotate"),
  HAPTIC_FEEDBACK("haptic_feedback", Settings.System.HAPTIC_FEEDBACK_ENABLED, "Touch vibration"),
  TOUCH_SOUNDS("touch_sounds", Settings.System.SOUND_EFFECTS_ENABLED, "Touch sounds");

  companion object {
    fun of(wire: String): SystemToggle =
      entries.firstOrNull { it.wire == wire } ?: throw PhoneSettingUnknown("system toggle", wire, entries.map { it.wire })
  }
}

object PhoneSystemSettings {
  private const val TAG = "SmartEverythingPhone"

  private val handler = Handler(Looper.getMainLooper())
  private var observer: ContentObserver? = null
  private var radios: BroadcastReceiver? = null

  val radioActions: List<String> = listOf(
    WifiManager.WIFI_STATE_CHANGED_ACTION,
    LocationManager.MODE_CHANGED_ACTION,
    Intent.ACTION_AIRPLANE_MODE_CHANGED
  )

  val watched: List<String> = SystemToggle.entries.map { it.key } + Settings.System.SCREEN_OFF_TIMEOUT

  fun int(context: Context, name: String): Int? = try {
    Settings.System.getInt(context.contentResolver, name)
  } catch (failure: Settings.SettingNotFoundException) {
    Log.w(TAG, "The system setting $name is not present on this phone: ${failure.message}")
    null
  }

  fun on(context: Context, toggle: SystemToggle): Boolean? = int(context, toggle.key)?.let { it != 0 }

  @Synchronized
  fun observe(context: Context) {
    if (observer != null) return
    val app = context.applicationContext
    val watch = object : ContentObserver(handler) {
      override fun onChange(selfChange: Boolean) = NativeGuard.run("PhoneSystemSettings") { PhoneReporter.report(app) }
    }
    watched.forEach { app.contentResolver.registerContentObserver(Settings.System.getUriFor(it), false, watch) }
    observer = watch
    val changes = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) = NativeGuard.run("PhoneRadios") { PhoneReporter.report(app) }
    }
    val filter = IntentFilter().apply { radioActions.forEach(::addAction) }
    app.registerReceiver(changes, filter, Context.RECEIVER_NOT_EXPORTED)
    radios = changes
  }

  @Synchronized
  fun stop(context: Context) {
    observer?.let { context.applicationContext.contentResolver.unregisterContentObserver(it) }
    observer = null
    radios?.let { context.applicationContext.unregisterReceiver(it) }
    radios = null
  }
}
