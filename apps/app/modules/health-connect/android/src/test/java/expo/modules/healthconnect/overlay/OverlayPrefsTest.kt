package expo.modules.healthconnect.overlay

import org.junit.Assert.assertEquals
import org.junit.Test

class OverlayPrefsTest {
  @Test
  fun `the phone prefs written by the app keep the theme next to the overlay prefs`() {
    val prefs = OverlayPrefs.parse(
      """{"enabled":false,"position":"left","glow":false,"captions":true,"display":"active","whileSharing":"small","theme":"light"}"""
    )
    assertEquals(OverlayTheme.Light, prefs.theme)
    assertEquals(OverlayPrefsData(enabled = false, position = OverlayPosition.Left, glow = false), prefs.data)
  }
}
