package expo.modules.healthconnect.diagnostics

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class JavaCrashRecorderTest {
  @get:Rule
  val folder = TemporaryFolder()

  private fun recorder() = JavaCrashRecorder(File(folder.root, "diagnostics/last-java-crash.txt"))

  private fun failure(): Throwable = IllegalStateException("Modal window already attached", RuntimeException("inner"))

  @Test
  fun `a recorded crash comes back as the java trace with its frames`() {
    val recorder = recorder()
    recorder.record(Thread.currentThread(), failure(), 1_000L)
    val trace = requireNotNull(recorder.matching(1_500L))
    assertEquals("java", trace["state"])
    assertEquals("IllegalStateException", trace["name"])
    assertEquals("Modal window already attached", trace["message"])
    val frames = trace["frames"] as List<*>
    assertTrue(frames.isNotEmpty())
    assertTrue(frames.size <= 24)
    assertEquals(frames.first(), trace["frame"])
    assertTrue(frames.any { it.toString().startsWith("Caused by java.lang.RuntimeException") })
  }

  @Test
  fun `a crash far from the process exit is not attached to it`() {
    val recorder = recorder()
    recorder.record(Thread.currentThread(), failure(), 1_000L)
    assertNull(recorder.matching(1_000L + 60_000L))
  }

  @Test
  fun `nothing recorded gives no trace`() {
    assertNull(recorder().matching(1_000L))
  }

  @Test
  fun `the next crash replaces the recorded one`() {
    val recorder = recorder()
    recorder.record(Thread.currentThread(), failure(), 1_000L)
    recorder.record(Thread.currentThread(), IllegalArgumentException("second"), 90_000L)
    assertNull(recorder.matching(1_000L))
    assertEquals("IllegalArgumentException", recorder.matching(90_000L)?.get("name"))
  }
}
