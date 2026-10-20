package expo.modules.healthconnect.phone

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import expo.modules.healthconnect.DomainConstants
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PhoneSettingsPagesTest {
  private val context = mockk<Context>()

  @Before
  fun setUp() {
    mockkObject(PhonePermissions, PhoneNotices)
    every { context.packageName } returns "com.smarteverything"
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `the table has exactly the pages the domain names, in the same order`() {
    assertEquals(DomainConstants.PHONE_SETTINGS_PAGES, PhoneSettingsPages.all.map { it.wire })
  }

  @Test
  fun `every page maps to its own Android settings action`() {
    val actions = PhoneSettingsPages.all.map { it.action }
    assertTrue(actions.all { it.startsWith("android.settings.") })
    assertEquals(actions.size, actions.toSet().size)
    assertEquals("android.settings.WIFI_SETTINGS", PhoneSettingsPages.of("wifi").action)
    assertEquals("android.settings.BLUETOOTH_SETTINGS", PhoneSettingsPages.of("bluetooth").action)
    assertEquals("android.settings.AIRPLANE_MODE_SETTINGS", PhoneSettingsPages.of("airplane").action)
    assertEquals("android.settings.action.MANAGE_WRITE_SETTINGS", PhoneSettingsPages.of("write_settings").action)
    assertEquals("android.settings.APPLICATION_DETAILS_SETTINGS", PhoneSettingsPages.of("app_details").action)
  }

  @Test
  fun `only the two pages about this app carry its package, and no page can name another app`() {
    assertEquals(listOf("write_settings", "app_details"), PhoneSettingsPages.all.filter { it.ofThisApp }.map { it.wire })
  }

  @Test
  fun `a name outside the table is refused, including a raw Android action or key`() {
    listOf("android.settings.WIFI_SETTINGS", "accelerometer_rotation", "WIFI", "").forEach { raw ->
      assertThrows(PhoneSettingUnknown::class.java) { PhoneSettingsPages.of(raw) }
    }
  }

  @Test
  fun `without display over other apps the page is offered as a tap on the phone`() {
    every { PhonePermissions.overlay(context) } returns false
    every { PhoneNotices.tapToOpen(context, "Wi-Fi settings", any()) } returns PhoneActionResult(true, "Shown on the phone; tap to open")
    val result = PhoneSettingsPages.open(context, "wifi")
    assertEquals(PhoneActionResult(true, "Shown on the phone; tap to open"), result)
    verify(exactly = 1) { PhoneNotices.tapToOpen(context, "Wi-Fi settings", any()) }
    verify(exactly = 0) { context.startActivity(any()) }
  }

  @Test
  fun `with display over other apps the page opens at once`() {
    every { PhonePermissions.overlay(context) } returns true
    every { context.startActivity(any<Intent>()) } returns Unit
    val result = PhoneSettingsPages.open(context, "location")
    assertTrue(result.ok)
    assertEquals("Opened Location settings on the phone", result.detail)
    verify(exactly = 1) { context.startActivity(any<Intent>()) }
  }

  @Test
  fun `a phone with no screen for the page answers with the page it lacks`() {
    every { PhonePermissions.overlay(context) } returns true
    every { context.startActivity(any<Intent>()) } throws ActivityNotFoundException("none")
    val failure = assertThrows(PhoneSettingsPageMissing::class.java) { PhoneSettingsPages.open(context, "nfc") }
    assertEquals("This phone has no screen for NFC settings", failure.message)
  }

  @Test
  fun `an unknown page opens nothing`() {
    every { PhonePermissions.overlay(context) } returns true
    assertFalse(runCatching { PhoneSettingsPages.open(context, "dark_mode") }.isSuccess)
    verify(exactly = 0) { context.startActivity(any<Intent>()) }
  }
}
