package expo.modules.healthconnect.phone

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

class SettingsPage(val wire: String, val label: String, val action: String, val ofThisApp: Boolean = false)

object PhoneSettingsPages {
  val all: List<SettingsPage> = listOf(
    SettingsPage("wifi", "Wi-Fi settings", Settings.ACTION_WIFI_SETTINGS),
    SettingsPage("bluetooth", "Bluetooth settings", Settings.ACTION_BLUETOOTH_SETTINGS),
    SettingsPage("internet", "Network and internet settings", Settings.ACTION_WIRELESS_SETTINGS),
    SettingsPage("location", "Location settings", Settings.ACTION_LOCATION_SOURCE_SETTINGS),
    SettingsPage("airplane", "Airplane mode settings", Settings.ACTION_AIRPLANE_MODE_SETTINGS),
    SettingsPage("nfc", "NFC settings", Settings.ACTION_NFC_SETTINGS),
    SettingsPage("battery_saver", "Battery saver settings", Settings.ACTION_BATTERY_SAVER_SETTINGS),
    SettingsPage("display", "Display settings", Settings.ACTION_DISPLAY_SETTINGS),
    SettingsPage("sound", "Sound settings", Settings.ACTION_SOUND_SETTINGS),
    SettingsPage("dnd_access", "Do Not Disturb access", Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS),
    SettingsPage("write_settings", "Modify system settings", Settings.ACTION_MANAGE_WRITE_SETTINGS, ofThisApp = true),
    SettingsPage("app_details", "SmartEverything app settings", Settings.ACTION_APPLICATION_DETAILS_SETTINGS, ofThisApp = true)
  )

  fun of(wire: String): SettingsPage =
    all.firstOrNull { it.wire == wire } ?: throw PhoneSettingUnknown("settings page", wire, all.map { it.wire })

  fun intent(context: Context, page: SettingsPage): Intent {
    val intent = Intent(page.action)
    if (page.ofThisApp) intent.data = Uri.fromParts("package", context.packageName, null)
    return intent
  }

  fun open(context: Context, wire: String): PhoneActionResult {
    val page = of(wire)
    val intent = intent(context, page)
    if (!PhonePermissions.overlay(context)) return PhoneNotices.tapToOpen(context, page.label, intent)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(intent)
    } catch (failure: ActivityNotFoundException) {
      throw PhoneSettingsPageMissing(page.label, failure)
    }
    return PhoneActionResult(true, "Opened ${page.label} on the phone")
  }
}
