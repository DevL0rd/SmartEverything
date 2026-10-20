package expo.modules.healthconnect.phone

import expo.modules.healthconnect.push.PhoneActionOrigin
import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneAskersTest {
  @Test
  fun `a link asked by the app opens at once when the phone allows display over other apps`() {
    assertEquals(LinkOpening.Direct, PhoneAskers.linkOpening(PhoneActionOrigin("app", "Desktop"), overlayAllowed = true))
  }

  @Test
  fun `a link asked by the app waits for a tap when display over other apps is off`() {
    assertEquals(LinkOpening.TapToOpen, PhoneAskers.linkOpening(PhoneActionOrigin("app", "Desktop"), overlayAllowed = false))
  }

  @Test
  fun `a link asked by the assistant an automation or a scene always waits for a tap`() {
    listOf("assistant", "automation", "scene").forEach { source ->
      assertEquals(LinkOpening.TapToOpen, PhoneAskers.linkOpening(PhoneActionOrigin(source), overlayAllowed = true))
    }
  }

  @Test
  fun `who asked is named with the client when there is one`() {
    assertEquals("Your assistant (Desk)", PhoneAskers.describe(PhoneActionOrigin("assistant", "Desk")))
    assertEquals("An automation", PhoneAskers.describe(PhoneActionOrigin("automation")))
    assertEquals("The SmartEverything app (Desktop)", PhoneAskers.describe("app", "Desktop"))
    assertEquals("A scene", PhoneAskers.describe("scene", ""))
  }
}
