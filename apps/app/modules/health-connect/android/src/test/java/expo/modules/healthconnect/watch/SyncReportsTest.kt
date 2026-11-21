package expo.modules.healthconnect.watch

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncReportsTest {
  @Test
  fun `a finished sync that only moves the sync time is reported once a minute`() {
    var lastReportAt = 0L
    var reports = 0
    var now = 60_000L
    while (now < 90_000L) {
      if (SyncReports.due(null, lastReportAt, now)) {
        reports += 1
        lastReportAt = now
      }
      now += 550L
    }
    assertEquals(1, reports)
  }

  @Test
  fun `a finished sync that clears a sync error is reported at once`() {
    assertTrue(SyncReports.due("Saving the watch data failed", 10_000L, 10_500L))
    assertFalse(SyncReports.due(null, 10_000L, 10_500L))
  }
}
