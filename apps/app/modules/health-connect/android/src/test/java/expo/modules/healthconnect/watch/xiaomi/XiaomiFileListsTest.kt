package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.CaptureOutcome
import expo.modules.healthconnect.watch.WatchCaptureUpload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiFileListsTest {
  private val sleep = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)

  @Test
  fun `the raw list names every id the watch sent, empty ones included, before any filtering`() {
    val text = XiaomiFileLists.raw("earlier days", sleep.bytes + ByteArray(7))
    assertTrue(text.startsWith("the watch listed 2 file id(s) from earlier days in 14 bytes: "))
    assertTrue(text.contains("${sleep.key} t0s8d1v6 ${sleep.timestamp}"))
    assertTrue(text.contains("00000000000000 t0s0d0v0 1970-01-01T00:00:00Z (empty id)"))
    assertEquals("the watch listed 0 file id(s) from today in 0 bytes: none", XiaomiFileLists.raw("today", ByteArray(0)))
  }

  @Test
  fun `a past list of ten ids is the watch's whole window`() {
    assertTrue(XiaomiFileLists.windowFull(List(10) { sleep }))
    assertFalse(XiaomiFileLists.windowFull(List(9) { sleep }))
  }

  @Test
  fun `a capture keeps the file id, kind, outcome and every byte`() {
    val bytes = ByteArray(3) { it.toByte() }
    val capture = XiaomiFileLists.capture(sleep, bytes, CaptureOutcome.STAGES_UNDECODED, "held")
    assertEquals(sleep.key, capture.key)
    assertEquals(listOf(0, 8, 1, 6), listOf(capture.type, capture.subtype, capture.detail, capture.version))
    assertEquals(sleep.timestamp, capture.watchTime)
    assertTrue(bytes.contentEquals(capture.bytes))
  }

  @Test
  fun `captures are sent in batches of at most four megabytes and never split a file`() {
    val big = XiaomiFileLists.capture(sleep, ByteArray(3 * 1024 * 1024), CaptureOutcome.READ, null)
    val small = XiaomiFileLists.capture(sleep, ByteArray(10), CaptureOutcome.READ, null)
    assertEquals(listOf(2, 1), WatchCaptureUpload.batches(listOf(big, small, big)).map { it.size })
    assertTrue(WatchCaptureUpload.batches(emptyList()).isEmpty())
  }
}
