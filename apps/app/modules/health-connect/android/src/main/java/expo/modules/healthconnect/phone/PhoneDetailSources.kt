package expo.modules.healthconnect.phone

import android.content.Context
import expo.modules.healthconnect.watch.FindPhone
import org.json.JSONObject

object PhoneControlState : PhoneDetailSource {
  override val sections: Set<PhoneSection> = emptySet()

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> = buildMap {
    PhoneFlashlight.state(context)?.let { put("flashlight", it) }
    put("ringing", FindPhone.isRinging())
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? = null
}

object PhoneDetailSources {
  val all: List<PhoneDetailSource> = listOf(PhoneBluetooth, PhoneApps, PhoneNotificationsDetail, PhoneControlState)
}
