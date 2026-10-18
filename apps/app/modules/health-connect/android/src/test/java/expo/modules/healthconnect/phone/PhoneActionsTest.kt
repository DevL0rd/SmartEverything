package expo.modules.healthconnect.phone

import android.content.Context
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import io.mockk.verify
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PhoneActionsTest {
  private val context = mockk<Context>()

  @Before
  fun setUp() {
    mockkObject(PhoneReporter, PhonePermissions, PhoneLive)
    every { PhoneReporter.report(any(), any(), any(), any()) } returns Unit
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  private fun run(json: String): PhoneActionResult = PhoneActionPush.runSafely(context, JSONObject(json))

  @Test
  fun `every action type the hub can send has a handler`() {
    assertEquals(PhoneActionType.entries.toSet(), PhoneActions.handlers.keys)
  }

  @Test
  fun `an action type this app does not know is answered not ok and names the list`() {
    val result = run("""{"type":"format_storage"}""")
    assertFalse(result.ok)
    assertTrue(result.detail.contains("\"format_storage\""))
  }

  @Test
  fun `locking and screenshots on an old Android are answered not ok with the version they need`() {
    assertEquals("Locking needs Android 9 or newer", run("""{"type":"lock"}""").detail)
    assertEquals("Screenshots need Android 11 or newer", run("""{"type":"screenshot"}""").detail)
    assertEquals("Receiving files needs Android 10 or newer", run("""{"type":"receive_file","fileId":"f","name":"a.pdf","mime":"application/pdf","url":"/media/a"}""").detail)
  }

  @Test
  fun `waking to the unlock prompt without display over other apps is answered not ok with the reason`() {
    every { PhonePermissions.overlay(context) } returns false
    val result = run("""{"type":"show_unlock"}""")
    assertFalse(result.ok)
    assertTrue(result.detail.contains("Display over other apps"))
  }

  @Test
  fun `live mode is switched through the live lease and reported`() {
    every { PhoneLive.set(any(), any()) } returns Unit
    val result = run("""{"type":"live","on":true}""")
    assertEquals(PhoneActionResult(true, "Live mode on"), result)
    verify { PhoneLive.set(context, true) }
  }

  @Test
  fun `a screen timeout without the grant is answered not ok with the reason`() {
    every { PhonePermissions.writeSettings(context) } returns false
    val result = run("""{"type":"set_timeout","seconds":60}""")
    assertFalse(result.ok)
    assertEquals("Modify system settings is not allowed for SmartEverything on this phone", result.detail)
  }

  @Test
  fun `dismissing and seeking without notification access are answered not ok`() {
    assertFalse(run("""{"type":"dismiss_notification","target":{"by":"key","key":"k"}}""").ok)
    assertFalse(run("""{"type":"seek","positionMs":1000}""").ok)
  }
}
