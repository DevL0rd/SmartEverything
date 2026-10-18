package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import expo.modules.healthconnect.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiFilesTest {
  @Test
  fun `a file id decodes its timestamp zone version and flag fields`() {
    val id = fileId(version = 4, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)
    assertEquals(instant(), id.timestamp)
    assertEquals(4, id.timezone)
    assertEquals(3600, id.zoneOffsetSeconds)
    assertEquals(4, id.version)
    assertEquals(XiaomiFileId.ACTIVITY, id.type)
    assertEquals(XiaomiFileId.SLEEP, id.subtype)
    assertEquals(XiaomiFileId.SUMMARY, id.detail)
    assertTrue(id.isSleep)
  }

  @Test
  fun `a workout id reports the sports type and its labels`() {
    val id = fileId(version = 4, subtype = 1, detail = XiaomiFileId.GPS, sports = true)
    assertEquals(XiaomiFileId.SPORTS, id.type)
    assertFalse(id.isSleep)
    assertTrue(id.label.startsWith("workout type 0x01 GPS track v4"))
    assertEquals("t1s1d2v4", id.shortLabel)
  }

  @Test
  fun `the key is the lowercase hex of the seven id bytes`() {
    assertEquals(7 * 2, fileId(1, 0, 0).key.length)
    assertEquals(fileId(1, 0, 0).key, fileId(1, 0, 0).key)
  }

  @Test
  fun `listing splits seven byte ids and drops empty ones`() {
    val real = fileId(2, XiaomiFileId.DAILY, XiaomiFileId.DETAILS).bytes
    val empty = ByteArray(7)
    val listed = XiaomiFileId.list(real + empty + real + byteArrayOf(1, 2, 3))
    assertEquals(2, listed.size)
    assertArrayEquals(real, listed[0].bytes)
    assertTrue(XiaomiFileId(empty).empty)
  }

  @Test
  fun `ids sort by time then summary before details before gps`() {
    val gps = fileId(1, XiaomiFileId.DAILY, XiaomiFileId.GPS)
    val details = fileId(1, XiaomiFileId.DAILY, XiaomiFileId.DETAILS)
    val summary = fileId(1, XiaomiFileId.DAILY, XiaomiFileId.SUMMARY)
    val earlier = fileId(1, XiaomiFileId.DAILY, XiaomiFileId.GPS, seconds = FIXTURE_EPOCH - 60)
    assertEquals(listOf(earlier, summary, details, gps), listOf(gps, details, summary, earlier).sorted())
  }

  @Test
  fun `the assembler returns the file when the last chunk arrives`() {
    val assembler = FileAssembler()
    assertNull(assembler.add(chunk(total = 2, number = 1, "0102")))
    assertArrayEquals(hex("010203"), assembler.add(chunk(total = 2, number = 2, "03")))
  }

  @Test
  fun `the assembler restarts when chunk one arrives again`() {
    val assembler = FileAssembler()
    assembler.add(chunk(total = 2, number = 1, "ff"))
    assertNull(assembler.add(chunk(total = 2, number = 1, "0a")))
    assertArrayEquals(hex("0a0b"), assembler.add(chunk(total = 2, number = 2, "0b")))
  }

  @Test
  fun `the assembler rejects a chunk without a header`() {
    assertThrows(IllegalArgumentException::class.java) { FileAssembler().add(hex("010002")) }
  }

  @Test
  fun `checked accepts a file with a valid checksum and rejects a corrupt one`() {
    val file = activityFile(hex("0102030405"))
    assertNotNull(FileAssembler.checked(file))
    assertThrows(IllegalArgumentException::class.java) { FileAssembler.checked(file.copyOf().also { it[9] = 0x7f }) }
    assertThrows(IllegalArgumentException::class.java) { FileAssembler.checked(ByteArray(FileAssembler.EMPTY_FILE - 1)) }
  }

  @Test
  fun `body skips the eight byte head and the four byte checksum`() {
    val body = FileAssembler.body(activityFile(hex("aabbcc")))
    assertEquals(3, body.remaining())
  }

  @Test
  fun `a presence bit is read most significant bit first`() {
    val header = hex("80 01")
    assertTrue(FileAssembler.valid(header, 0))
    assertFalse(FileAssembler.valid(header, 1))
    assertTrue(FileAssembler.valid(header, 15))
    assertFalse(FileAssembler.valid(header, 16))
  }

  private fun chunk(total: Int, number: Int, payload: String): ByteArray =
    LittleEndianBytes().u16(total).u16(number).raw(hex(payload)).toByteArray()
}
