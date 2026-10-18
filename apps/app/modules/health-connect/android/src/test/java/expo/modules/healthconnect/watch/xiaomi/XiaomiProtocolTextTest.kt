package expo.modules.healthconnect.watch.xiaomi

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiProtocolTextTest {
  @Test
  fun `an unknown sleep file version is described in plain words`() {
    val id = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.DETAILS)
    val error = assertThrows(UnsupportedFile::class.java) { XiaomiSleepParsers.details(id, activityFile(ByteArray(8))) }
    assertTrue(error.message.orEmpty().endsWith("sleep version 6 is not known (this app reads 1 to 5)"))
  }

  @Test
  fun `an unknown gps track version is described in plain words`() {
    val id = fileId(version = 9, subtype = 1, detail = XiaomiFileId.GPS, sports = true)
    val error = assertThrows(UnsupportedFile::class.java) { XiaomiGpsParser.route(id, activityFile(ByteArray(8))) }
    assertTrue(error.message.orEmpty().endsWith("GPS track version 9 is not known (this app reads 1 to 3)"))
  }

  @Test
  fun `the declared sport source does not name another app`() {
    val declared = XiaomiSports.declared("miwear.watch.p62g", "Xiaomi Watch S5")
    assertEquals("declared Watch S5 sport set (the watch did not answer 2/39)", declared?.source)
  }

  @Test
  fun `no watch source file names another app`() {
    val root = File("src/main/java/expo/modules/healthconnect/watch")
    val named = root.walkTopDown().filter { it.isFile && it.readText().contains("gadgetbridge", ignoreCase = true) }.toList()
    assertTrue(root.isDirectory)
    assertFalse("files naming another app: $named", named.isNotEmpty())
  }
}
