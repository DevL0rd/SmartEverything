package expo.modules.healthconnect.phone

import android.content.Context
import expo.modules.healthconnect.DomainConstants
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.unmockkAll
import io.mockk.verify
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class PhoneActionPushTest {
  private val context = mockk<Context>()

  @Before
  fun setUp() {
    mockkObject(PhoneActionPush)
    every { PhoneActionPush.answer(any(), any(), any()) } returns Unit
  }

  @After
  fun tearDown() {
    unmockkAll()
  }

  private fun push(action: String) = mapOf(
    DomainConstants.PUSH_PAYLOAD_KEY to """{"requestId":"r1","action":$action,"origin":{"source":"app"}}"""
  )

  @Test
  fun `only a receive_file action goes to the file worker`() {
    assertTrue(PhoneActionPush.receivesFile(JSONObject("""{"type":"receive_file"}""")))
    assertFalse(PhoneActionPush.receivesFile(JSONObject("""{"type":"ring"}""")))
    assertFalse(PhoneActionPush.receivesFile(JSONObject("""{"type":"from_a_newer_hub"}""")))
    assertFalse(PhoneActionPush.receivesFile(JSONObject("{}")))
  }

  @Test
  fun `an unknown action type pushed to handle is answered not ok`() {
    PhoneActionPush.handle(context, push("""{"type":"from_a_newer_hub"}"""))
    verify { PhoneActionPush.answer(context, "r1", match { !it.ok && it.detail.isNotEmpty() }) }
  }

  @Test
  fun `an action without a type pushed to handle is answered not ok`() {
    PhoneActionPush.handle(context, push("{}"))
    verify { PhoneActionPush.answer(context, "r1", match { !it.ok }) }
  }
}
