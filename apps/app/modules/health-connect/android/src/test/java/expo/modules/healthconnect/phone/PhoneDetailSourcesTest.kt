package expo.modules.healthconnect.phone

import android.content.Context
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneDetailSourcesTest {
  @Test
  fun `every detail section has exactly one source across both slices`() {
    val produced = PhoneDetailRegistry.sources.flatMap { it.sections }
    assertEquals(PhoneSection.entries.toSet(), produced.toSet())
    assertEquals(produced.size, produced.toSet().size)
  }

  @Test
  fun `the apps, notifications and connections sections come from the action slice sources`() {
    assertEquals(
      mapOf(
        PhoneSection.CONNECTIONS to PhoneBluetooth,
        PhoneSection.APPS to PhoneApps,
        PhoneSection.NOTIFICATIONS to PhoneNotificationsDetail
      ),
      PhoneDetailSources.all.flatMap { source -> source.sections.map { it to source } }.toMap()
    )
  }

  @Test
  fun `the apps section is refreshed while live so the front app stays current`() {
    assertEquals(true, PhoneReadRequest(live = true, slow = false).wants(PhoneSection.APPS))
    assertEquals(false, PhoneReadRequest(live = false, slow = false).wants(PhoneSection.APPS))
  }

  @Test
  fun `notifications are read on a slow report or while live and not on every report at rest`() {
    assertEquals(false, PhoneReadRequest(live = false, slow = false).wants(PhoneSection.NOTIFICATIONS))
    assertEquals(true, PhoneReadRequest(live = false, slow = true).wants(PhoneSection.NOTIFICATIONS))
    assertEquals(true, PhoneReadRequest(live = true, slow = false).wants(PhoneSection.NOTIFICATIONS))
  }

  @Test
  fun `the notification count is left out of a report at rest`() {
    val context = mockk<Context>()
    assertEquals(emptyMap<String, Any?>(), PhoneNotificationsDetail.values(context, PhoneReadRequest(live = false, slow = false)))
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  @Test
  fun `the torch state and the ring state are reported as values`() {
    mockkObject(PhoneFlashlight)
    val context = mockk<Context>()
    every { PhoneFlashlight.state(context) } returns "on"
    val values = PhoneControlState.values(context, PhoneReadRequest(live = false, slow = false))
    assertEquals(mapOf("flashlight" to "on", "ringing" to false), values)
  }

  @Test
  fun `a phone without a torch reports no flashlight value`() {
    mockkObject(PhoneFlashlight)
    val context = mockk<Context>()
    every { PhoneFlashlight.state(context) } returns null
    assertEquals(mapOf("ringing" to false), PhoneControlState.values(context, PhoneReadRequest(live = false, slow = false)))
  }
}
