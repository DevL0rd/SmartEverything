package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayHostTest {
  private val visible = OverlayHostFacts(shown = true, locked = false, screenOn = true, canDrawOverlays = true, sessionShown = false)

  @Test
  fun `an unlocked phone with the overlay permission shows the call bar in an overlay window`() {
    assertEquals(OverlayHostKind.Window, OverlayHostRule.hostFor(visible))
  }

  @Test
  fun `nothing is hosted while the view is hidden`() {
    assertEquals(OverlayHostKind.None, OverlayHostRule.hostFor(visible.copy(shown = false)))
    assertEquals(OverlayHostKind.None, OverlayHostRule.hostFor(visible.copy(shown = false, sessionShown = true, locked = true)))
  }

  @Test
  fun `the lock screen uses the assistant session and never an overlay window`() {
    assertEquals(OverlayHostKind.Session, OverlayHostRule.hostFor(visible.copy(locked = true, sessionShown = true)))
    assertEquals(OverlayHostKind.None, OverlayHostRule.hostFor(visible.copy(locked = true)))
  }

  @Test
  fun `an unlocked session hands over to the overlay window when the permission is granted`() {
    assertEquals(OverlayHostKind.Window, OverlayHostRule.hostFor(visible.copy(sessionShown = true)))
  }

  @Test
  fun `without the overlay permission the session keeps hosting and otherwise only the notification remains`() {
    assertEquals(OverlayHostKind.Session, OverlayHostRule.hostFor(visible.copy(canDrawOverlays = false, sessionShown = true)))
    assertEquals(OverlayHostKind.None, OverlayHostRule.hostFor(visible.copy(canDrawOverlays = false)))
  }

  @Test
  fun `overlay windows are removed while the screen is off`() {
    assertEquals(OverlayHostKind.None, OverlayHostRule.hostFor(visible.copy(screenOn = false)))
  }

  @Test
  fun `the session stays over home only when locked or without the overlay permission`() {
    assertTrue(OverlayHostRule.sessionKeeps(locked = true, canDrawOverlays = true))
    assertTrue(OverlayHostRule.sessionKeeps(locked = false, canDrawOverlays = false))
    assertFalse(OverlayHostRule.sessionKeeps(locked = false, canDrawOverlays = true))
  }

  @Test
  fun `picture in picture only auto enters when the call bar cannot show`() {
    assertFalse(OverlayHostRule.pipAutoEnter(wanted = true, barAvailable = OverlayHostRule.barAvailable(enabled = true, canDrawOverlays = true)))
    assertTrue(OverlayHostRule.pipAutoEnter(wanted = true, barAvailable = OverlayHostRule.barAvailable(enabled = true, canDrawOverlays = false)))
    assertTrue(OverlayHostRule.pipAutoEnter(wanted = true, barAvailable = OverlayHostRule.barAvailable(enabled = false, canDrawOverlays = true)))
    assertFalse(OverlayHostRule.pipAutoEnter(wanted = false, barAvailable = false))
  }

  @Test
  fun `the assist gesture opens the app when it is in front, hosts a running call and otherwise starts one`() {
    val call = PowerButton.Call
    assertEquals(SessionStart.OpenApp, OverlayHostRule.sessionStart(appForeground = true, callRunning = false, wake = false, press = call))
    assertEquals(SessionStart.HostOnly, OverlayHostRule.sessionStart(appForeground = false, callRunning = true, wake = false, press = call))
    assertEquals(SessionStart.HostOnly, OverlayHostRule.sessionStart(appForeground = false, callRunning = false, wake = true, press = call))
    assertEquals(SessionStart.StartCall, OverlayHostRule.sessionStart(appForeground = false, callRunning = false, wake = false, press = call))
  }

  @Test
  fun `with voice messages chosen the power button records in the open app or opens the chat to record`() {
    val voice = PowerButton.VoiceMessage
    assertEquals(SessionStart.VoiceInApp, OverlayHostRule.sessionStart(appForeground = true, callRunning = false, wake = false, press = voice))
    assertEquals(SessionStart.OpenVoiceMessage, OverlayHostRule.sessionStart(appForeground = false, callRunning = false, wake = false, press = voice))
    assertEquals(SessionStart.HostOnly, OverlayHostRule.sessionStart(appForeground = false, callRunning = true, wake = false, press = voice))
    assertEquals(SessionStart.OpenApp, OverlayHostRule.sessionStart(appForeground = true, callRunning = true, wake = false, press = voice))
    assertEquals(SessionStart.HostOnly, OverlayHostRule.sessionStart(appForeground = false, callRunning = false, wake = true, press = voice))
  }
}
