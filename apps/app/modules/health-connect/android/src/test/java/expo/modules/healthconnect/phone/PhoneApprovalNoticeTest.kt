package expo.modules.healthconnect.phone

import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneApprovalNoticeTest {
  @Test
  fun `the allow button asks the system for authentication on Android 12 and newer`() {
    assertEquals(AllowAuthentication.Notification, PhoneApprovalNotice.allowAuthentication(31))
    assertEquals(AllowAuthentication.Notification, PhoneApprovalNotice.allowAuthentication(35))
  }

  @Test
  fun `the allow button goes through the keyguard on Android 11 and older`() {
    assertEquals(AllowAuthentication.Keyguard, PhoneApprovalNotice.allowAuthentication(30))
    assertEquals(AllowAuthentication.Keyguard, PhoneApprovalNotice.allowAuthentication(26))
  }

  @Test
  fun `the wording names every underscore of the action and who asked`() {
    assertEquals("Allow show unlock prompt?", PhoneApprovalNotice.title("show_unlock_prompt"))
    assertEquals(
      "Your assistant wants to unlock Desk",
      PhoneApprovalNotice.text("assistant", "unlock", "Desk")
    )
  }
}
