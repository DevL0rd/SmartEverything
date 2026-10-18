package expo.modules.healthconnect.phone

import android.media.AudioDeviceInfo
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.PowerManager
import android.telephony.TelephonyDisplayInfo
import android.telephony.TelephonyManager
import expo.modules.healthconnect.media.NowPlaying
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PhoneReadingsPureTest {
  @Test
  fun `the battery is stepped by five percent at rest and exact while live`() {
    assertEquals(75, PhoneReadings.steppedBattery(78, live = false))
    assertEquals(78, PhoneReadings.steppedBattery(78, live = true))
  }

  @Test
  fun `a low battery is exact even at rest`() {
    assertEquals(17, PhoneReadings.steppedBattery(17, live = false))
  }

  @Test
  fun `an impossible battery level is not reported`() {
    assertNull(PhoneReadings.steppedBattery(-1, live = true))
    assertNull(PhoneReadings.steppedBattery(101, live = false))
  }

  @Test
  fun `the network kind follows the transport`() {
    fun caps(transport: Int) = mockk<NetworkCapabilities>().also {
      every { it.hasTransport(any()) } answers { firstArg<Int>() == transport }
    }
    assertEquals("wifi", PhoneReadings.networkKind(caps(NetworkCapabilities.TRANSPORT_WIFI)))
    assertEquals("cellular", PhoneReadings.networkKind(caps(NetworkCapabilities.TRANSPORT_CELLULAR)))
    assertEquals("ethernet", PhoneReadings.networkKind(caps(NetworkCapabilities.TRANSPORT_ETHERNET)))
    assertEquals("other", PhoneReadings.networkKind(caps(NetworkCapabilities.TRANSPORT_VPN)))
    assertEquals("offline", PhoneReadings.networkKind(null))
  }
}

class PhonePowerPureTest {
  @Test
  fun `the charger kind follows the plugged bits`() {
    assertEquals("none", PhonePower.chargerOf(0))
    assertEquals("ac", PhonePower.chargerOf(BatteryManager.BATTERY_PLUGGED_AC))
    assertEquals("usb", PhonePower.chargerOf(BatteryManager.BATTERY_PLUGGED_USB))
    assertEquals("wireless", PhonePower.chargerOf(BatteryManager.BATTERY_PLUGGED_WIRELESS))
    assertEquals("dock", PhonePower.chargerOf(BatteryManager.BATTERY_PLUGGED_DOCK))
  }

  @Test
  fun `wireless wins over usb when both bits are set`() {
    assertEquals("wireless", PhonePower.chargerOf(BatteryManager.BATTERY_PLUGGED_WIRELESS or BatteryManager.BATTERY_PLUGGED_USB))
  }

  @Test
  fun `the battery health maps to the contract names`() {
    assertEquals("good", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_GOOD))
    assertEquals("overheat", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_OVERHEAT))
    assertEquals("dead", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_DEAD))
    assertEquals("over_voltage", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_OVER_VOLTAGE))
    assertEquals("failure", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_UNSPECIFIED_FAILURE))
    assertEquals("cold", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_COLD))
    assertEquals("unknown", PhonePower.healthOf(BatteryManager.BATTERY_HEALTH_UNKNOWN))
  }

  @Test
  fun `the thermal status maps to the contract names`() {
    assertEquals("normal", PhonePower.thermalOf(PowerManager.THERMAL_STATUS_NONE))
    assertEquals("light", PhonePower.thermalOf(PowerManager.THERMAL_STATUS_LIGHT))
    assertEquals("moderate", PhonePower.thermalOf(PowerManager.THERMAL_STATUS_MODERATE))
    assertEquals("severe", PhonePower.thermalOf(PowerManager.THERMAL_STATUS_SEVERE))
    assertEquals("critical", PhonePower.thermalOf(PowerManager.THERMAL_STATUS_CRITICAL))
    assertEquals("critical", PhonePower.thermalOf(PowerManager.THERMAL_STATUS_SHUTDOWN))
  }

  @Test
  fun `the temperature steps by a degree at rest and by half a degree while live`() {
    assertEquals(31.0, PhonePower.steppedTemperature(30.6, live = false), 0.0)
    assertEquals(30.5, PhonePower.steppedTemperature(30.6, live = true), 0.0)
  }

  @Test
  fun `the voltage steps by a tenth of a volt at rest and is exact while live`() {
    assertEquals(4100, PhonePower.steppedVoltage(4137, live = false))
    assertEquals(4137, PhonePower.steppedVoltage(4137, live = true))
  }

  @Test
  fun `the full time rounds to fifteen minutes at rest and to the minute while live`() {
    val at = Instant.parse("2026-10-18T10:05:40Z").toEpochMilli()
    assertEquals(Instant.parse("2026-10-18T10:00:00Z"), PhonePower.steppedMoment(at, live = false))
    assertEquals(Instant.parse("2026-10-18T10:06:00Z"), PhonePower.steppedMoment(at, live = true))
  }
}

class PhoneSoundPureTest {
  @Test
  fun `a device type becomes a route kind`() {
    assertEquals("speaker", PhoneSound.routeKind(AudioDeviceInfo.TYPE_BUILTIN_SPEAKER, "", null))
    assertEquals("wired", PhoneSound.routeKind(AudioDeviceInfo.TYPE_WIRED_HEADSET, "", null))
    assertEquals("usb", PhoneSound.routeKind(AudioDeviceInfo.TYPE_USB_HEADSET, "", null))
    assertEquals("bluetooth", PhoneSound.routeKind(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, "AA:BB", null))
    assertEquals("car", PhoneSound.routeKind(AudioDeviceInfo.TYPE_BUS, "", null))
    assertEquals("other", PhoneSound.routeKind(AudioDeviceInfo.TYPE_HDMI, "", null))
  }

  @Test
  fun `the chosen car stereo is a car and not a plain Bluetooth device`() {
    assertEquals("car", PhoneSound.routeKind(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, "AA:BB", "AA:BB"))
    assertEquals("bluetooth", PhoneSound.routeKind(AudioDeviceInfo.TYPE_BLUETOOTH_A2DP, "CC:DD", "AA:BB"))
  }

  @Test
  fun `a connected Bluetooth device wins over the speaker`() {
    val route = PhoneSound.chosenRoute(listOf(AudioRoute("speaker", null), AudioRoute("bluetooth", "Buds"), AudioRoute("wired", null)))
    assertEquals("bluetooth", route.kind)
    assertEquals("Buds", route.name)
  }

  @Test
  fun `no device at all means the speaker`() {
    assertEquals("speaker", PhoneSound.chosenRoute(emptyList()).kind)
  }

  @Test
  fun `nothing playing is no media`() {
    assertEquals(org.json.JSONObject.NULL, PhoneSound.mediaSection(null, live = true))
    assertEquals(org.json.JSONObject.NULL, PhoneSound.mediaSection(NowPlaying(null, "", "", null, null, 0, 0), live = true))
  }

  @Test
  fun `the position is only reported while live`() {
    val playing = NowPlaying(true, "Song", "Band", "Music", "com.music", 12, 200)
    val rest = PhoneSound.mediaSection(playing, live = false) as org.json.JSONObject
    val live = PhoneSound.mediaSection(playing, live = true) as org.json.JSONObject
    assertEquals(org.json.JSONObject.NULL, rest.get("positionMs"))
    assertEquals(12000L, live.getLong("positionMs"))
    assertEquals(200000L, rest.getLong("durationMs"))
    assertEquals("playing", live.getString("state"))
    assertEquals("com.music", live.getString("app"))
    assertEquals("Music", live.getString("appLabel"))
  }

  @Test
  fun `a paused player with no title has a null title`() {
    val paused = PhoneSound.mediaSection(NowPlaying(false, "", "", "Music", "com.music", 0, 0), live = false) as org.json.JSONObject
    assertEquals("paused", paused.getString("state"))
    assertEquals(org.json.JSONObject.NULL, paused.get("title"))
    assertEquals(org.json.JSONObject.NULL, paused.get("durationMs"))
  }
}

class PhoneScreenPureTest {
  @Test
  fun `brightness is a percent and steps by ten at rest`() {
    assertEquals(100, PhoneScreen.brightnessPercent(255, 255, live = true))
    assertEquals(50, PhoneScreen.brightnessPercent(128, 255, live = true))
    assertEquals(50, PhoneScreen.brightnessPercent(128, 255, live = false))
    assertEquals(40, PhoneScreen.brightnessPercent(100, 255, live = false))
    assertEquals(0, PhoneScreen.brightnessPercent(0, 255, live = false))
  }

  @Test
  fun `brightness follows the scale the phone reports`() {
    assertEquals(100, PhoneScreen.brightnessPercent(4095, 4095, live = true))
    assertEquals(50, PhoneScreen.brightnessPercent(2048, 4095, live = true))
    assertEquals(20, PhoneScreen.brightnessPercent(819, 4095, live = false))
  }

  @Test
  fun `a week of screen minutes ends today and fills quiet days with zero`() {
    val zone = ZoneId.of("UTC")
    val today = LocalDate.of(2026, 10, 18)
    fun at(day: LocalDate) = day.atStartOfDay(zone).toInstant().toEpochMilli()
    val days = PhoneScreen.minutesByDay(
      listOf(UsageBucket(at(today), 90 * 60_000L), UsageBucket(at(today.minusDays(2)), 30 * 60_000L), UsageBucket(at(today.minusDays(2)) + 1, 15 * 60_000L)),
      today,
      zone
    )
    assertEquals(7, days.size)
    assertEquals(today.minusDays(6), days.first().first)
    assertEquals(today to 90, days.last())
    assertEquals(45, days[4].second)
    assertEquals(0, days[0].second)
  }

  @Test
  fun `a day cannot hold more than a day of minutes`() {
    val zone = ZoneId.of("UTC")
    val today = LocalDate.of(2026, 10, 18)
    val days = PhoneScreen.minutesByDay(listOf(UsageBucket(today.atStartOfDay(zone).toInstant().toEpochMilli(), 30 * 3_600_000L)), today, zone)
    assertEquals(1440, days.last().second)
  }
}

class PhoneSignalPureTest {
  @Test
  fun `Wi-Fi strength becomes bars`() {
    assertEquals(4, PhoneSignal.barsOf(-50))
    assertEquals(3, PhoneSignal.barsOf(-60))
    assertEquals(2, PhoneSignal.barsOf(-70))
    assertEquals(1, PhoneSignal.barsOf(-80))
    assertEquals(0, PhoneSignal.barsOf(-95))
  }

  @Test
  fun `at rest the strength is the weakest one that shows the same bars`() {
    assertEquals(-66, PhoneSignal.reportedDbm(-60, live = false))
    assertEquals(-60, PhoneSignal.reportedDbm(-60, live = true))
    assertEquals(PhoneSignal.barsOf(-60), PhoneSignal.barsOf(PhoneSignal.reportedDbm(-60, live = false)))
  }

  @Test
  fun `the mobile generation follows the data network type`() {
    assertEquals("4g", PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_LTE, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE))
    assertEquals("5g", PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_NR, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE))
    assertEquals("3g", PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_HSPA, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE))
    assertEquals("2g", PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_EDGE, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE))
    assertNull(PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_UNKNOWN, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NONE))
  }

  @Test
  fun `a 5G override on a 4G link is 5G`() {
    assertEquals("5g", PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_LTE, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_NSA))
    assertEquals("5g", PhoneSignal.generationOf(TelephonyManager.NETWORK_TYPE_LTE, TelephonyDisplayInfo.OVERRIDE_NETWORK_TYPE_NR_ADVANCED))
  }

  @Test
  fun `the band is the frequency in gigahertz to one place`() {
    assertEquals(2.4, PhoneSignal.bandGhz(2437), 0.0)
    assertEquals(5.2, PhoneSignal.bandGhz(5180), 0.0)
    assertEquals(0.0, PhoneSignal.bandGhz(0), 0.0)
  }
}

class PhoneStoragePureTest {
  @Test
  fun `the parts add up to the used space and the system holds the rest`() {
    val gb = 1_000_000_000L
    val parts = PhoneStorage.parts(256 * gb, 100 * gb, StorageBreakdown(40 * gb, 10 * gb, 5 * gb, 5 * gb, 30 * gb)).toMap()
    assertEquals(40 * gb, parts.getValue("apps"))
    assertEquals(10 * gb, parts.getValue("images"))
    assertEquals(10 * gb, parts.getValue("other"))
    assertEquals(256 * gb, parts.values.sum() + 100 * gb)
    assertTrue(parts.getValue("system") >= 0)
  }

  @Test
  fun `a part never goes below zero`() {
    val parts = PhoneStorage.parts(10, 9, StorageBreakdown(50, 0, 0, 0, 0)).toMap()
    assertEquals(0L, parts.getValue("system"))
  }

  @Test
  fun `only the largest apps are listed biggest first`() {
    val sizes = (1..15).map { AppSize("app.$it", "App $it", it * 100L) }
    val biggest = PhoneStorage.biggest(sizes)
    assertEquals(10, biggest.size)
    assertEquals("app.15", biggest.first().packageName)
    assertEquals("app.6", biggest.last().packageName)
  }
}

class PhoneLivePureTest {
  @Test
  fun `a live lease lasts ten minutes`() {
    assertEquals(1_000L + 600_000L, PhoneLive.leaseEndsAt(1_000L))
  }
}

class PhoneFeaturesPureTest {
  @Test
  fun `a ready feature has only a name and a state`() {
    assertEquals("""{"feature":"usage","state":"ready"}""", PhoneFeatures.json("usage", FeatureState.Ready).toString())
  }

  @Test
  fun `a feature that needs a permission names it and the reason`() {
    val json = PhoneFeatures.json("dnd", FeatureState.NeedsPermission("android_dnd", "Off"))
    assertEquals("needs_permission", json.getString("state"))
    assertEquals("android_dnd", json.getString("permission"))
    assertEquals("Off", json.getString("reason"))
  }

  @Test
  fun `an unsupported feature carries a reason and no permission`() {
    val json = PhoneFeatures.json("fold", FeatureState.Unsupported("No fold"))
    assertEquals("unsupported", json.getString("state"))
    assertEquals("No fold", json.getString("reason"))
    assertTrue(!json.has("permission"))
  }
}
