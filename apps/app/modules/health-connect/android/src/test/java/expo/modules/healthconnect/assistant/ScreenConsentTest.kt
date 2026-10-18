package expo.modules.healthconnect.assistant

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ScreenConsentTest {
  @Test
  fun `android 14 and later offer only the entire screen so the share survives leaving the app`() {
    assertTrue(ScreenConsent.entireScreenOnly(34))
    assertTrue(ScreenConsent.entireScreenOnly(36))
  }

  @Test
  fun `android 13 and earlier have no single app choice and keep the plain consent`() {
    assertFalse(ScreenConsent.entireScreenOnly(33))
    assertFalse(ScreenConsent.entireScreenOnly(26))
  }
}
