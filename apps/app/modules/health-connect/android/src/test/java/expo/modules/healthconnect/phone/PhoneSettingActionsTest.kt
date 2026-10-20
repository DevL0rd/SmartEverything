package expo.modules.healthconnect.phone

import android.content.Context
import expo.modules.healthconnect.DomainConstants
import expo.modules.healthconnect.push.PhoneActionOrigin
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PhoneSettingActionsTest {
  private val context = mockk<Context>()

  @Before
  fun setUp() {
    mockkObject(PhoneReporter, PhonePermissions)
    every { PhoneReporter.report(any(), any(), any(), any()) } returns Unit
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  private fun run(json: String): PhoneActionResult = PhoneActionPush.runSafely(context, JSONObject(json), PhoneActionOrigin("assistant", "Desk"))

  @Test
  fun `a system toggle without the grant is answered not ok with the reason`() {
    every { PhonePermissions.writeSettings(context) } returns false
    val result = run("""{"type":"set_system_toggle","setting":"auto_rotate","on":false}""")
    assertFalse(result.ok)
    assertEquals("Modify system settings is not allowed for SmartEverything on this phone", result.detail)
  }

  @Test
  fun `a system toggle outside the three is answered not ok and names the three`() {
    val result = run("""{"type":"set_system_toggle","setting":"wifi_on","on":true}""")
    assertFalse(result.ok)
    assertTrue(result.detail.contains("\"wifi_on\""))
    assertTrue(result.detail.contains("auto_rotate"))
  }

  @Test
  fun `a settings page outside the table is answered not ok and names the pages`() {
    val result = run("""{"type":"open_settings","page":"android.settings.DATE_SETTINGS"}""")
    assertFalse(result.ok)
    assertTrue(result.detail.contains("\"android.settings.DATE_SETTINGS\""))
    assertTrue(result.detail.contains("write_settings"))
  }

  @Test
  fun `the toggles the phone can write are exactly the ones the domain names`() {
    assertEquals(DomainConstants.PHONE_SYSTEM_TOGGLES, SystemToggle.entries.map { it.wire })
  }

  @Test
  fun `a screen timeout is reported only when it is one of the choices`() {
    DomainConstants.PHONE_SCREEN_TIMEOUTS.forEach { seconds ->
      assertEquals(seconds.toString(), PhoneScreen.timeoutOption(seconds * 1000))
    }
    assertNull(PhoneScreen.timeoutOption(45_000))
    assertNull(PhoneScreen.timeoutOption(2_147_483_647))
    assertNull(PhoneScreen.timeoutOption(60_500))
  }

  @Test
  fun `the settings watched at rest are the three toggles and the screen timeout`() {
    assertEquals(
      listOf("accelerometer_rotation", "haptic_feedback_enabled", "sound_effects_enabled", "screen_off_timeout"),
      PhoneSystemSettings.watched
    )
  }

  @Test
  fun `the radio switches watched at rest are Wi-Fi, location and airplane mode`() {
    assertEquals(
      listOf("android.net.wifi.WIFI_STATE_CHANGED", "android.location.MODE_CHANGED", "android.intent.action.AIRPLANE_MODE"),
      PhoneSystemSettings.radioActions
    )
  }
}
