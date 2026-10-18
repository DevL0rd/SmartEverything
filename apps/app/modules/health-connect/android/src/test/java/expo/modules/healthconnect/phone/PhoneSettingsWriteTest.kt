package expo.modules.healthconnect.phone

import android.content.Context
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
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
}
