package expo.modules.healthconnect.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class PhoneAppsTest {
  private val apps = listOf(
    LaunchableApp("com.google.android.youtube", "YouTube", 1),
    LaunchableApp("com.spotify.music", "Spotify", 2),
    LaunchableApp("com.a.notes", "Notes", 3),
    LaunchableApp("com.b.notes", "notes", 4)
  )

  @Test
  fun `an exact package name picks that app`() {
    assertEquals("com.spotify.music", PhoneApps.resolve("com.spotify.music", apps).packageName)
  }

  @Test
  fun `a label matches without regard to case or surrounding spaces`() {
    assertEquals("com.google.android.youtube", PhoneApps.resolve("  youtube ", apps).packageName)
  }

  @Test
  fun `an unknown app names what it looked for`() {
    val failure = assertThrows(PhoneAppUnknown::class.java) { PhoneApps.resolve("Maps", apps) }
    assertEquals(true, failure.message.orEmpty().contains("\"Maps\""))
  }

  @Test
  fun `two apps with the same label are refused and listed`() {
    val failure = assertThrows(PhoneAppAmbiguous::class.java) { PhoneApps.resolve("Notes", apps) }
    assertEquals(true, failure.message.orEmpty().contains("com.a.notes, com.b.notes"))
  }
}
