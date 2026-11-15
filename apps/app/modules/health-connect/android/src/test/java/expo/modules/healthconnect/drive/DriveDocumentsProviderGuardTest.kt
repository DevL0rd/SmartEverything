package expo.modules.healthconnect.drive

import expo.modules.healthconnect.BackgroundReadNotGranted
import io.mockk.every
import io.mockk.mockk
import java.io.FileNotFoundException
import java.io.IOException
import org.junit.Assert.assertThrows
import org.junit.Test

class DriveDocumentsProviderGuardTest {
  private fun unreachable(): DriveDocumentsProvider {
    val browser = mockk<DriveBrowser>()
    every { browser.item(any()) } throws IOException("hub unreachable")
    every { browser.roots() } throws BackgroundReadNotGranted()
    every { browser.rootAccess(any()) } throws IOException("hub unreachable")
    every { browser.move(any(), any()) } throws IOException("hub unreachable")
    return DriveDocumentsProvider().apply { browserFactory = { browser } }
  }

  private val item = DriveDocumentId.Item("item").wire
  private val root = DriveDocumentId.Drive("root").wire

  @Test
  fun `rename with the hub unreachable surfaces a file error`() {
    assertThrows(FileNotFoundException::class.java) { unreachable().renameDocument(item, "b.txt") }
  }

  @Test
  fun `delete with the hub unreachable surfaces a file error`() {
    assertThrows(FileNotFoundException::class.java) { unreachable().deleteDocument(item) }
  }

  @Test
  fun `a drive root query with no cached roots surfaces a file error`() {
    assertThrows(FileNotFoundException::class.java) { unreachable().queryDocument(root, null) }
  }

  @Test
  fun `move with the hub unreachable surfaces a file error`() {
    assertThrows(FileNotFoundException::class.java) { unreachable().moveDocument(item, root, DriveDocumentId.Item("folder").wire) }
  }
}
