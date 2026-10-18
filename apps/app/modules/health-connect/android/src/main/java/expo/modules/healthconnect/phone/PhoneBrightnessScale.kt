package expo.modules.healthconnect.phone

import android.content.res.Resources

object PhoneBrightnessScale {
  private const val RESOURCE = "config_screenBrightnessSettingMaximum"

  fun maximum(): Int {
    val system = Resources.getSystem()
    val id = system.getIdentifier(RESOURCE, "integer", "android")
    if (id == 0) throw PhoneReadingUnavailable("the brightness scale", "Android names no $RESOURCE")
    return system.getInteger(id)
  }
}
