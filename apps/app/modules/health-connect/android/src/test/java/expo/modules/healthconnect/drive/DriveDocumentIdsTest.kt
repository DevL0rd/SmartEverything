package expo.modules.healthconnect.drive

import java.io.FileNotFoundException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveDocumentIdsTest {
  private val uuid = "0b9f6a3c-4f55-4c0e-9d57-0d3f6a1b2c3d"

  @Test
  fun `a drive root id round trips`() {
    val parsed = DriveDocumentId.parse("drive:$uuid")
    assertTrue(parsed is DriveDocumentId.Drive)
    assertEquals(uuid, (parsed as DriveDocumentId.Drive).rootId)
    assertEquals("drive:$uuid", parsed.wire)
  }

  @Test
  fun `an item id round trips`() {
    val parsed = DriveDocumentId.parse("item:$uuid")
    assertTrue(parsed is DriveDocumentId.Item)
    assertEquals(uuid, (parsed as DriveDocumentId.Item).itemId)
    assertEquals("item:$uuid", parsed.wire)
  }

  @Test
  fun `the shared and offline roots have fixed ids`() {
    assertEquals(DriveDocumentId.SharedWithMe, DriveDocumentId.parse("shared"))
    assertEquals(DriveDocumentId.Offline, DriveDocumentId.parse("offline"))
    assertEquals("shared", DriveDocumentId.SharedWithMe.wire)
    assertEquals("offline", DriveDocumentId.Offline.wire)
  }

  @Test
  fun `an id that is not ours is refused`() {
    assertThrows(FileNotFoundException::class.java) { DriveDocumentId.parse("item:not-a-uuid") }
    assertThrows(FileNotFoundException::class.java) { DriveDocumentId.parse("drive:") }
    assertThrows(FileNotFoundException::class.java) { DriveDocumentId.parse("primary:Download") }
    assertThrows(FileNotFoundException::class.java) { DriveDocumentId.parse("") }
  }
}
