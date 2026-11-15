package expo.modules.healthconnect.drive

import android.provider.DocumentsContract.Document
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class DriveDocumentFlagsTest {
  private fun has(flags: Int, flag: Int) = flags and flag != 0

  @Test
  fun `an owner can write rename move delete and copy a file`() {
    val flags = DriveDocumentFlags.of(folder = false, access = DriveAccess.OWN, locked = false, online = true, thumb = false)
    assertTrue(has(flags, Document.FLAG_SUPPORTS_WRITE))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_RENAME))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_MOVE))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_DELETE))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_COPY))
    assertFalse(has(flags, Document.FLAG_DIR_SUPPORTS_CREATE))
  }

  @Test
  fun `a folder can create children where the person may write`() {
    for (access in listOf(DriveAccess.OWN, DriveAccess.SHARED, DriveAccess.EDIT)) {
      val flags = DriveDocumentFlags.of(folder = true, access = access, locked = false, online = true, thumb = false)
      assertTrue(has(flags, Document.FLAG_DIR_SUPPORTS_CREATE))
      assertFalse(has(flags, Document.FLAG_SUPPORTS_WRITE))
    }
  }

  @Test
  fun `a view grantee gets no write rename move or delete`() {
    val flags = DriveDocumentFlags.of(folder = false, access = DriveAccess.VIEW, locked = false, online = true, thumb = true)
    assertFalse(has(flags, Document.FLAG_SUPPORTS_WRITE))
    assertFalse(has(flags, Document.FLAG_SUPPORTS_RENAME))
    assertFalse(has(flags, Document.FLAG_SUPPORTS_MOVE))
    assertFalse(has(flags, Document.FLAG_SUPPORTS_DELETE))
    assertFalse(has(flags, Document.FLAG_DIR_SUPPORTS_CREATE))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_COPY))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_THUMBNAIL))
  }

  @Test
  fun `a locked item for a view grantee cannot be copied`() {
    val flags = DriveDocumentFlags.of(folder = false, access = DriveAccess.VIEW, locked = true, online = true, thumb = false)
    assertFalse(has(flags, Document.FLAG_SUPPORTS_COPY))
  }

  @Test
  fun `a lock does not limit anyone who may write`() {
    val flags = DriveDocumentFlags.of(folder = false, access = DriveAccess.EDIT, locked = true, online = true, thumb = false)
    assertTrue(has(flags, Document.FLAG_SUPPORTS_COPY))
    assertTrue(has(flags, Document.FLAG_SUPPORTS_WRITE))
  }

  @Test
  fun `offline documents carry no change flags`() {
    val flags = DriveDocumentFlags.of(folder = false, access = DriveAccess.OWN, locked = false, online = false, thumb = false)
    assertEquals(0, flags)
  }

  @Test
  fun `only a view grantee of a locked item is refused the file`() {
    assertFalse(DriveDocumentFlags.opens(DriveAccess.VIEW, locked = true, write = false))
    assertTrue(DriveDocumentFlags.opens(DriveAccess.VIEW, locked = false, write = false))
    assertTrue(DriveDocumentFlags.opens(DriveAccess.EDIT, locked = true, write = true))
    assertFalse(DriveDocumentFlags.opens(DriveAccess.VIEW, locked = false, write = true))
    assertTrue(DriveDocumentFlags.opens(DriveAccess.OWN, locked = true, write = false))
  }

  @Test
  fun `grant roles map to access and nothing else does`() {
    assertEquals(DriveAccess.VIEW, DriveAccess.ofRole("view"))
    assertEquals(DriveAccess.EDIT, DriveAccess.ofRole("edit"))
    assertThrows(IllegalArgumentException::class.java) { DriveAccess.ofRole("owner") }
    assertEquals(DriveAccess.SHARED, DriveAccess.of("shared"))
    assertThrows(IllegalArgumentException::class.java) { DriveAccess.of("root") }
  }
}
