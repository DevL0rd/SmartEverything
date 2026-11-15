package expo.modules.healthconnect.drive

import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Test

class DriveTusPlanTest {
  @Test
  fun `chunks are the chunk size and a shorter last one`() {
    val chunk = 10
    assertEquals(10, DriveTusPlan.next(0, 25, chunk))
    assertEquals(10, DriveTusPlan.next(10, 25, chunk))
    assertEquals(5, DriveTusPlan.next(20, 25, chunk))
    assertEquals(3L, DriveTusPlan.chunkCount(25, chunk))
    assertEquals(2L, DriveTusPlan.chunkCount(20, chunk))
    assertEquals(0L, DriveTusPlan.chunkCount(0, chunk))
  }

  @Test
  fun `a file smaller than a chunk goes in one piece`() {
    assertEquals(7, DriveTusPlan.next(0, 7))
    assertEquals(1L, DriveTusPlan.chunkCount(7))
  }

  @Test
  fun `metadata is base64 pairs`() {
    val text = DriveTusPlan.metadata(linkedMapOf("filename" to "a b.txt", "itemId" to "x"))
    val pairs = text.split(",").map { it.split(" ") }
    assertEquals("filename", pairs[0][0])
    assertEquals("a b.txt", String(Base64.getDecoder().decode(pairs[0][1]), Charsets.UTF_8))
    assertEquals("itemId", pairs[1][0])
    assertEquals("x", String(Base64.getDecoder().decode(pairs[1][1]), Charsets.UTF_8))
  }

  @Test
  fun `the replace target names the item and the revision it was based on`() {
    assertEquals(
      mapOf("targetKind" to "item", "itemId" to "i", "baseRev" to "4"),
      DriveTusTarget.Replace("i", 4).fields(),
    )
    assertEquals(mapOf("targetKind" to "folder", "folderId" to "f"), DriveTusTarget.Folder("f").fields())
    assertEquals(mapOf("targetKind" to "drive", "rootId" to "r"), DriveTusTarget.Top("r").fields())
  }
}
