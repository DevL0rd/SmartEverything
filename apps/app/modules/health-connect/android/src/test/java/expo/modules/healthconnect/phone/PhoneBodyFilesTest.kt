package expo.modules.healthconnect.phone

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class PhoneBodyFilesTest {
  @get:Rule
  val folder = TemporaryFolder()

  private fun file(name: String, modifiedAt: Long): File = folder.newFile(name).also { it.setLastModified(modifiedAt) }

  @Test
  fun `only a file no queued work names and that is old enough to be queued already is removed`() {
    val orphan = file("orphan", 1_000L)
    val queued = file("queued", 1_000L)
    val fresh = file("fresh", 9_000L)
    val stale = PhoneBodyFiles.unreferenced(listOf(orphan, queued, fresh), pending = setOf("queued"), queuedBefore = 5_000L)
    assertEquals(listOf(orphan), stale)
  }

  @Test
  fun `with no grace a file of cancelled work is removed at once`() {
    val cancelled = file("cancelled", 4_000L)
    assertEquals(listOf(cancelled), PhoneBodyFiles.unreferenced(listOf(cancelled), pending = emptySet(), queuedBefore = 5_000L))
  }
}
