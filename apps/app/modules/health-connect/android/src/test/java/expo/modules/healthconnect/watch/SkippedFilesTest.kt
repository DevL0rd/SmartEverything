package expo.modules.healthconnect.watch

import expo.modules.healthconnect.MemoryPreferences
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SkippedFilesTest {
  private val preferences = MemoryPreferences()
  private val sleepV6 = "8-3-1-6-1792301280"

  @Test
  fun `a file skipped by this build stays skipped when the watch reconnects`() {
    SkippedFiles(preferences, WATCH, BUILD).add(sleepV6)
    assertEquals(setOf(sleepV6), SkippedFiles(preferences, WATCH, BUILD).toSet())
  }

  @Test
  fun `a newer build reads again the files an older build could not read`() {
    SkippedFiles(preferences, WATCH, BUILD).add(sleepV6)
    assertTrue(SkippedFiles(preferences, WATCH, BUILD + 1).isEmpty())
    assertTrue(SkippedFiles(preferences, WATCH, BUILD).isEmpty())
  }

  @Test
  fun `skips stored before builds were recorded are read again`() {
    preferences.edit().putStringSet("skipped-2b:$WATCH", setOf(sleepV6)).apply()
    assertTrue(SkippedFiles(preferences, WATCH, BUILD).isEmpty())
  }

  @Test
  fun `each watch keeps its own skips`() {
    SkippedFiles(preferences, WATCH, BUILD).add(sleepV6)
    assertTrue(SkippedFiles(preferences, "other-watch", BUILD).isEmpty())
    assertEquals(1, SkippedFiles(preferences, WATCH, BUILD).size)
  }

  private companion object {
    const val WATCH = "f4fa34e6-8a76-402b-993c-2583e5cb0a05"
    const val BUILD = 1_792_360_124_000L
  }
}
