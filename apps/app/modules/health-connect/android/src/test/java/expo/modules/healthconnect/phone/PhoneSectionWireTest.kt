package expo.modules.healthconnect.phone

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import expo.modules.healthconnect.media.NowPlaying
import io.mockk.every
import io.mockk.mockk
import java.time.Instant
import java.time.LocalDate
import org.json.JSONObject
import org.junit.Test

class PhoneSectionWireTest {
  @Test
  fun `the playing media has the shape the hub contract fixture names`() {
    val playing = NowPlaying(true, "Song", "Artist", "Spotify", "com.spotify.music", 1, 200)
    val media = PhoneWireFixture.section("live", "sound").get("media")
    PhoneWireFixture.sameShape(media, PhoneSound.mediaSection(playing, live = true), "sound.media")
  }

  @Test
  fun `the alarm section has the shape the hub contract fixture names`() {
    val context = mockk<Context>()
    val alarms = mockk<AlarmManager>()
    val next = mockk<AlarmManager.AlarmClockInfo>()
    val shown = mockk<PendingIntent>()
    val packages = mockk<PackageManager>()
    every { context.getSystemService(AlarmManager::class.java) } returns alarms
    every { alarms.nextAlarmClock } returns next
    every { next.triggerTime } returns 1_000_000L
    every { next.showIntent } returns shown
    every { shown.creatorPackage } returns "com.clock"
    every { context.packageManager } returns packages
    every { packages.getApplicationInfo("com.clock", 0) } returns ApplicationInfo()
    every { packages.getApplicationLabel(any()) } returns "Clock"
    val section = PhoneAlarm.section(context, PhoneSection.ALARM, PhoneReadRequest(live = false, slow = false))
    PhoneWireFixture.sameShape(PhoneWireFixture.section("live", "alarm"), section, "alarm")
  }

  private fun wire(report: String, name: String) = PhoneWireFixture.section(report, name)

  @Test
  fun `the storage section has the shape the hub contract fixture names`() {
    val section = PhoneStorage.body(
      256_000_000_000L,
      41_000_000_000L,
      listOf("apps" to 60_000_000_000L),
      listOf(AppSize("com.example.big", "Big", 5_000_000_000L))
    )
    PhoneWireFixture.sameShape(wire("live", "storage"), section, "storage")
    PhoneWireFixture.sameShape(wire("rest", "storage"), PhoneStorage.body(1L, 1L, emptyList(), emptyList()), "storage")
  }

  @Test
  fun `the apps section has the shape the hub contract fixture names`() {
    val usage = AppUsage("com.a", listOf(1, 2, 3, 4, 5, 6, 30), Instant.parse("2026-10-18T09:50:00Z"))
    val section = PhoneApps.body(
      listOf(LaunchableApp("com.a", "A", 1L), LaunchableApp("com.b", "B", 2L)),
      { if (it == "com.a") "a".repeat(64) else null },
      listOf(usage),
      "com.a"
    )
    PhoneWireFixture.sameShape(wire("live", "apps"), section, "apps")
    PhoneWireFixture.sameShape(wire("rest", "apps"), PhoneApps.body(listOf(LaunchableApp("com.a", "A", 1L)), { null }, emptyList(), null), "apps")
  }

  @Test
  fun `the sound section has the shape the hub contract fixture names`() {
    val section = PhoneSound.body(
      PhoneSound.streamsBody(40, 70, 80, 50, 60),
      AudioRoute("bluetooth", "Galaxy Buds3"),
      PhoneSound.mediaSection(NowPlaying(true, "Song", "Artist", "Spotify", "com.spotify.music", 1, 200), live = true)
    )
    PhoneWireFixture.sameShape(wire("live", "sound"), section, "sound")
    PhoneWireFixture.sameShape(wire("rest", "sound"), PhoneSound.body(PhoneSound.streamsBody(1, 1, 1, 1, 1), AudioRoute("speaker", null), JSONObject.NULL), "sound")
  }

  @Test
  fun `the screen section has the shape the hub contract fixture names`() {
    val days = (0 until 7).map { LocalDate.parse("2026-10-12").plusDays(it.toLong()) to 100 + it }
    val section = PhoneScreen.body(60, true, 60, "open", true, PhoneScreen.usageBody(41, days))
    PhoneWireFixture.sameShape(wire("live", "screen"), section, "screen")
    PhoneWireFixture.sameShape(wire("rest", "screen"), PhoneScreen.body(60, true, 60, null, true, JSONObject.NULL), "screen")
  }

  @Test
  fun `the network section has the shape the hub contract fixture names`() {
    val section = PhoneSignal.body(
      "wifi",
      PhoneSignal.wifiBody("Home", -52, 4, 866, 5.0),
      PhoneSignal.cellularBody(3, "5g", "Telstra"),
      vpn = false,
      metered = false,
      airplane = false,
      data = PhoneSignal.dataBody(1_000_000_000L, 200_000_000L, 30_000_000_000L, 4_000_000_000L)
    )
    PhoneWireFixture.sameShape(wire("live", "network"), section, "network")
    PhoneWireFixture.sameShape(wire("rest", "network"), PhoneSignal.body("offline", null, null, vpn = false, metered = false, airplane = false, data = JSONObject.NULL), "network")
  }
}
