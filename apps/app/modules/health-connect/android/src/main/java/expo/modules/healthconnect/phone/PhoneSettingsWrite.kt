package expo.modules.healthconnect.phone

import android.content.Context
import android.provider.Settings

object PhoneSettingsWrite {
  private const val PERCENT = 100
  private const val MS_PER_SECOND = 1000

  fun brightnessLevel(percent: Int, maximum: Int): Int =
    ((percent.coerceIn(0, PERCENT) * maximum + PERCENT / 2) / PERCENT).coerceAtLeast(1)

  fun timeoutMillis(seconds: Int): Int {
    if (seconds <= 0) throw PhoneTimeoutInvalid(seconds)
    return seconds * MS_PER_SECOND
  }

  fun brightness(context: Context, percent: Int): PhoneActionResult {
    write(context, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL, "brightness mode")
    write(context, Settings.System.SCREEN_BRIGHTNESS, brightnessLevel(percent, PhoneBrightnessScale.maximum()), "brightness")
    return PhoneActionResult(true, "Brightness $percent%, automatic brightness off")
  }

  fun autoBrightness(context: Context, on: Boolean): PhoneActionResult {
    val mode = if (on) Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC else Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL
    write(context, Settings.System.SCREEN_BRIGHTNESS_MODE, mode, "brightness mode")
    return PhoneActionResult(true, if (on) "Automatic brightness on" else "Automatic brightness off")
  }

  fun timeout(context: Context, seconds: Int): PhoneActionResult {
    write(context, Settings.System.SCREEN_OFF_TIMEOUT, timeoutMillis(seconds), "screen timeout")
    return PhoneActionResult(true, "Screen timeout $seconds seconds")
  }

  private fun write(context: Context, name: String, value: Int, label: String) {
    if (!PhonePermissions.writeSettings(context)) throw PhonePermissionMissing("Modify system settings")
    if (!Settings.System.putInt(context.contentResolver, name, value)) throw PhoneSettingNotSaved(label)
  }
}
