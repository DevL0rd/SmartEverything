package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import expo.modules.healthconnect.hex
import expo.modules.healthconnect.watch.SampleKind
import expo.modules.healthconnect.watch.SpotKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiDailyParsersTest {
  private val details = fileId(version = 2, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.DETAILS)

  @Test
  fun `details v2 reads steps energy distance and heart rate per minute`() {
    val body = LittleEndianBytes().raw(hex("ba 0c c0 00"))
      .u16(120).u8(5).u16(90).u8(72)
      .u16(0x4000 or 30).u8(6).u16(100).u8(75).u8(0xee)
      .toByteArray()
    val minutes = XiaomiDailyParsers.details(details, activityFile(body))
    assertEquals(2, minutes.size)
    assertEquals(instant(), minutes[0].time)
    assertEquals(listOf(120, 5, 90, 72), listOf(minutes[0].steps, minutes[0].activeKcal, minutes[0].distanceMeters, minutes[0].heartRate))
    assertEquals(instant(60), minutes[1].time)
    assertEquals(listOf(30, 6, 100, 75), listOf(minutes[1].steps, minutes[1].activeKcal, minutes[1].distanceMeters, minutes[1].heartRate))
    assertNull(minutes[0].spo2)
    assertNull(minutes[0].stress)
  }

  @Test
  fun `details v2 leaves absent groups empty`() {
    val body = LittleEndianBytes().raw(hex("00 00 00 00")).toByteArray()
    assertTrue(XiaomiDailyParsers.details(details, activityFile(body)).isEmpty())
    val withMinute = LittleEndianBytes().raw(hex("80 00 00 00")).u16(0).toByteArray()
    val minute = XiaomiDailyParsers.details(details, activityFile(withMinute)).single()
    assertNull(minute.steps)
    assertNull(minute.heartRate)
  }

  @Test
  fun `details v3 adds oxygen and stress and treats 255 stress as missing`() {
    val id = fileId(version = 3, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.DETAILS)
    val body = LittleEndianBytes().raw(hex("ba 0c c0 0c c0"))
      .u16(10).u8(1).u16(5).u8(70).u8(97).u8(40)
      .u16(11).u8(1).u16(6).u8(71).u8(96).u8(255)
      .toByteArray()
    val minutes = XiaomiDailyParsers.details(id, activityFile(body))
    assertEquals(listOf(97, 40), listOf(minutes[0].spo2, minutes[0].stress))
    assertEquals(96, minutes[1].spo2)
    assertNull(minutes[1].stress)
  }

  @Test
  fun `details keeps a minute of running at 210 steps`() {
    val body = LittleEndianBytes().raw(hex("ba 0c c0 00")).u16(210).u8(20).u16(250).u8(185).toByteArray()
    val minute = XiaomiDailyParsers.details(details, activityFile(body)).single()
    assertEquals(listOf(210, 20, 250, 185), listOf(minute.steps, minute.activeKcal, minute.distanceMeters, minute.heartRate))
  }

  @Test
  fun `details rejects a minute above the physical step limit`() {
    val body = LittleEndianBytes().raw(hex("ba 0c c0 00")).u16(301).u8(1).u16(5).u8(70).toByteArray()
    val error = assertThrows(ImplausibleMinute::class.java) { XiaomiDailyParsers.details(details, activityFile(body)) }
    assertEquals("steps", error.field)
    assertEquals(301, error.value)
    assertEquals(300, error.limit)
  }

  @Test
  fun `details rejects an unknown version`() {
    val id = fileId(version = 9, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.DETAILS)
    assertThrows(UnsupportedFile::class.java) { XiaomiDailyParsers.details(id, activityFile(ByteArray(8))) }
  }

  @Test
  fun `summary v5 reads resting heart rate and vitality`() {
    val id = fileId(version = 5, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    val summary = XiaomiDailyParsers.summary(id, activityFile(summaryBody(hex("10 00 00 10"), 32, resting = 62, vitality = 55)))
    assertEquals(62, summary.resting.single().bpm)
    assertEquals(instant(), summary.resting.single().time)
    assertEquals(SampleKind.VITALITY, summary.vitality.single().kind)
    assertEquals(55, summary.vitality.single().value)
  }

  @Test
  fun `summary of a day without readings is empty instead of ending early`() {
    val id = fileId(version = 5, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    listOf(ByteArray(0), ByteArray(2)).forEach { body ->
      val summary = XiaomiDailyParsers.summary(id, activityFile(body))
      assertTrue(summary.resting.isEmpty())
      assertTrue(summary.vitality.isEmpty())
    }
  }

  @Test
  fun `summary v5 of 69 bytes as the Watch S5 sends it reads its 30 fields instead of ending early`() {
    val id = fileId(version = 5, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    val file = activityFile(summaryBody(hex("10 00 00 10"), 30, resting = 61, vitality = 48))
    assertEquals(69, file.size)
    val summary = XiaomiDailyParsers.summary(id, file)
    assertEquals(61, summary.resting.single().bpm)
    assertEquals(48, summary.vitality.single().value)
  }

  @Test
  fun `summary refuses a layout that ends inside a field`() {
    val id = fileId(version = 5, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    val cut = summaryBody(hex("10 00 00 10"), 29, resting = 61, vitality = 48) + ByteArray(1)
    assertThrows(IllegalArgumentException::class.java) { XiaomiDailyParsers.summary(id, activityFile(cut + ByteArray(1))) }
  }

  @Test
  fun `summary v4 has no vitality slot`() {
    val id = fileId(version = 4, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    val summary = XiaomiDailyParsers.summary(id, activityFile(summaryBody(hex("10 00 00"), 21, resting = 58, vitality = 0)))
    assertEquals(58, summary.resting.single().bpm)
    assertTrue(summary.vitality.isEmpty())
  }

  @Test
  fun `summary drops a resting rate outside the human range and unflagged slots`() {
    val id = fileId(version = 5, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    assertTrue(XiaomiDailyParsers.summary(id, activityFile(summaryBody(hex("10 00 00 10"), 32, resting = 10, vitality = 5))).resting.isEmpty())
    assertTrue(XiaomiDailyParsers.summary(id, activityFile(summaryBody(hex("00 00 00 00"), 32, resting = 62, vitality = 5))).resting.isEmpty())
  }

  @Test
  fun `summary rejects an unknown version`() {
    val id = fileId(version = 2, subtype = XiaomiFileId.DAILY, detail = XiaomiFileId.SUMMARY)
    assertThrows(UnsupportedFile::class.java) { XiaomiDailyParsers.summary(id, activityFile(ByteArray(8))) }
  }

  @Test
  fun `manual v1 reads oxygen and stress spot readings`() {
    val id = fileId(version = 1, subtype = XiaomiFileId.MANUAL, detail = XiaomiFileId.DETAILS)
    val body = LittleEndianBytes().u8(0xff)
      .u32(FIXTURE_EPOCH).u8(0x02).u8(98)
      .u32(FIXTURE_EPOCH + 60).u8(0x03).u8(40)
      .toByteArray()
    val spots = XiaomiDailyParsers.manual(id, activityFile(body))
    assertEquals(listOf(SpotKind.SPO2, SpotKind.STRESS), spots.map { it.kind })
    assertEquals(listOf(98, 40), spots.map { it.value })
    assertEquals(instant(60), spots[1].time)
  }

  @Test
  fun `manual v1 rejects a wrong layout and an unknown kind`() {
    val id = fileId(version = 1, subtype = XiaomiFileId.MANUAL, detail = XiaomiFileId.DETAILS)
    assertThrows(UnsupportedFile::class.java) { XiaomiDailyParsers.manual(id, activityFile(hex("00 01 02"))) }
    val unknown = LittleEndianBytes().u8(0xff).u32(FIXTURE_EPOCH).u8(0x09).u8(1).toByteArray()
    assertThrows(UnsupportedFile::class.java) { XiaomiDailyParsers.manual(id, activityFile(unknown)) }
  }

  @Test
  fun `manual v2 reads heart rate oxygen and stress, skips zero values and the 0x44 record`() {
    val id = fileId(version = 2, subtype = XiaomiFileId.MANUAL, detail = XiaomiFileId.DETAILS)
    val body = LittleEndianBytes()
      .u32(FIXTURE_EPOCH).u8(0x11).u8(70)
      .u32(FIXTURE_EPOCH + 1).u8(0x12).u8(0)
      .u32(FIXTURE_EPOCH + 2).u8(0x13).u8(33)
      .u32(FIXTURE_EPOCH + 3).u8(0x44).u32(7)
      .toByteArray()
    val spots = XiaomiDailyParsers.manual(id, activityFile(body))
    assertEquals(listOf(SpotKind.HEART_RATE, SpotKind.STRESS), spots.map { it.kind })
    assertEquals(listOf(70, 33), spots.map { it.value })
  }

  @Test
  fun `manual rejects an unknown version and an unknown v2 kind`() {
    val unknownVersion = fileId(version = 3, subtype = XiaomiFileId.MANUAL, detail = XiaomiFileId.DETAILS)
    assertThrows(UnsupportedFile::class.java) { XiaomiDailyParsers.manual(unknownVersion, activityFile(ByteArray(0))) }
    val id = fileId(version = 2, subtype = XiaomiFileId.MANUAL, detail = XiaomiFileId.DETAILS)
    val body = LittleEndianBytes().u32(FIXTURE_EPOCH).u8(0x7f).u8(1).toByteArray()
    assertThrows(UnsupportedFile::class.java) { XiaomiDailyParsers.manual(id, activityFile(body)) }
  }

  private fun summaryBody(header: ByteArray, slots: Int, resting: Int, vitality: Int): ByteArray {
    val widths = intArrayOf(4, 2, 1, 1, 1, 4, 1, 4, 1, 1, 1, 1, 3, 2, 2, 1, 1, 4, 1, 4, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 2, 2)
    val out = LittleEndianBytes().raw(header)
    for (slot in 0 until slots) {
      when (slot) {
        3 -> out.u8(resting)
        27 -> out.u16(vitality)
        else -> out.raw(ByteArray(widths[slot]))
      }
    }
    return out.toByteArray()
  }
}
