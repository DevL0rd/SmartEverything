package expo.modules.healthconnect.phone

import android.content.ContentResolver
import android.content.Context
import android.provider.Settings
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PhoneSettingsWriteTest {
  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `brightness percent maps onto the phone's own scale and never reaches the black level`() {
    assertEquals(1, PhoneSettingsWrite.brightnessLevel(0, 255))
    assertEquals(128, PhoneSettingsWrite.brightnessLevel(50, 255))
    assertEquals(255, PhoneSettingsWrite.brightnessLevel(100, 255))
    assertEquals(255, PhoneSettingsWrite.brightnessLevel(400, 255))
    assertEquals(2048, PhoneSettingsWrite.brightnessLevel(50, 4095))
    assertEquals(4095, PhoneSettingsWrite.brightnessLevel(100, 4095))
  }

  @Test
  fun `a screen timeout is in milliseconds and must be above zero`() {
    assertEquals(30_000, PhoneSettingsWrite.timeoutMillis(30))
    assertThrows(PhoneTimeoutInvalid::class.java) { PhoneSettingsWrite.timeoutMillis(0) }
  }

  @Test
  fun `a write without the Modify system settings grant is refused before anything is saved`() {
    mockkObject(PhonePermissions)
    val context = mockk<Context>()
    every { PhonePermissions.writeSettings(context) } returns false
    val failure = assertThrows(PhonePermissionMissing::class.java) { PhoneSettingsWrite.brightness(context, 40) }
    assertEquals("Modify system settings is not allowed for SmartEverything on this phone", failure.message)
  }

  private val context = mockk<Context>()
  private val resolver = mockk<ContentResolver>()

  private fun withGrant() {
    mockkObject(PhonePermissions)
    mockkStatic(Settings.System::class)
    every { PhonePermissions.writeSettings(context) } returns true
    every { context.contentResolver } returns resolver
  }

  @Test
  fun `each system toggle writes one or zero under its own Android key and reads it back`() {
    withGrant()
    val keys = mapOf(
      "auto_rotate" to "accelerometer_rotation",
      "haptic_feedback" to "haptic_feedback_enabled",
      "touch_sounds" to "sound_effects_enabled"
    )
    keys.forEach { (setting, key) ->
      listOf(true, false).forEach { on ->
        val value = if (on) 1 else 0
        every { Settings.System.putInt(resolver, key, value) } returns true
        every { Settings.System.getInt(resolver, key) } returns value
        assertEquals(true, PhoneSettingsWrite.systemToggle(context, setting, on).ok)
        verify(exactly = 1) { Settings.System.putInt(resolver, key, value) }
      }
    }
  }

  @Test
  fun `a toggle names the setting and the new state in its answer`() {
    withGrant()
    every { Settings.System.putInt(resolver, "haptic_feedback_enabled", 0) } returns true
    every { Settings.System.getInt(resolver, "haptic_feedback_enabled") } returns 0
    assertEquals("Touch vibration off", PhoneSettingsWrite.systemToggle(context, "haptic_feedback", false).detail)
  }

  @Test
  fun `a toggle without the Modify system settings grant is refused before anything is written`() {
    withGrant()
    every { PhonePermissions.writeSettings(context) } returns false
    val failure = assertThrows(PhonePermissionMissing::class.java) { PhoneSettingsWrite.systemToggle(context, "auto_rotate", true) }
    assertEquals("Modify system settings is not allowed for SmartEverything on this phone", failure.message)
    verify(exactly = 0) { Settings.System.putInt(any(), any(), any()) }
  }

  @Test
  fun `a setting name outside the three toggles is refused and never reaches Android`() {
    withGrant()
    listOf("wifi_on", "screen_off_timeout", "accelerometer_rotation", "").forEach { raw ->
      assertThrows(PhoneSettingUnknown::class.java) { PhoneSettingsWrite.systemToggle(context, raw, true) }
    }
    verify(exactly = 0) { Settings.System.putInt(any(), any(), any()) }
  }

  @Test
  fun `a toggle Android did not keep is reported as not saved instead of claiming success`() {
    withGrant()
    every { Settings.System.putInt(resolver, "sound_effects_enabled", 1) } returns true
    every { Settings.System.getInt(resolver, "sound_effects_enabled") } returns 0
    val ignored = assertThrows(PhoneSettingNotSaved::class.java) { PhoneSettingsWrite.systemToggle(context, "touch_sounds", true) }
    assertEquals("Android did not save the touch sounds setting", ignored.message)
    every { Settings.System.putInt(resolver, "sound_effects_enabled", 1) } returns false
    assertThrows(PhoneSettingNotSaved::class.java) { PhoneSettingsWrite.systemToggle(context, "touch_sounds", true) }
  }
}
