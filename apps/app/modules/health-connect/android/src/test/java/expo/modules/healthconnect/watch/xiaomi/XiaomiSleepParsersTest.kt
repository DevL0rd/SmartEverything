package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import expo.modules.healthconnect.hex
import expo.modules.healthconnect.watch.SleepStages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class XiaomiSleepParsersTest {
  private val sleep = fileId(version = 1, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.DETAILS)
  private val bed = FIXTURE_EPOCH
  private val wake = FIXTURE_EPOCH + 8 * 3600

  @Test
  fun `details reads the night and its stage packet`() {
    val stages = stagePacket(bed, 17, (1 shl 12) or 30, (2 shl 12) or 45, (0 shl 12) or 5, (3 shl 12) or 10, (9 shl 12) or 1)
    val night = XiaomiSleepParsers.details(sleep, activityFile(nightHead(bed, wake) + stages)).single()
    assertEquals(instant(), night.start)
    assertEquals(instant(8 * 3600), night.end)
    assertEquals(
      listOf(SleepStages.LIGHT, SleepStages.DEEP, SleepStages.AWAKE, SleepStages.REM, SleepStages.UNKNOWN),
      night.stages.map { it.stage }
    )
    assertEquals(instant(), night.stages[0].start)
    assertEquals(instant(30 * 60), night.stages[0].end)
    assertEquals(instant(30 * 60), night.stages[1].start)
    assertEquals(instant((30 + 45 + 5 + 10 + 1) * 60L), night.stages[4].end)
  }

  @Test
  fun `details skips flag only packets and finds the stage packet after garbage`() {
    val flag = packetHead(bed, 0x2, 0)
    val stages = stagePacket(bed, 17, (4 shl 12) or 20)
    val file = activityFile(nightHead(bed, wake) + hex("0102 03") + flag + stages)
    assertEquals(SleepStages.OUT_OF_BED, XiaomiSleepParsers.details(sleep, file).single().stages.single().stage)
  }

  @Test
  fun `details keeps a night longer than a day`() {
    val longWake = bed + 25 * 3600
    val night = XiaomiSleepParsers.details(sleep, activityFile(nightHead(bed, longWake))).single()
    assertEquals(instant(25 * 3600), night.end)
  }

  @Test
  fun `details returns no night when the wake time is not after bed time`() {
    assertTrue(XiaomiSleepParsers.details(sleep, activityFile(nightHead(wake, bed))).isEmpty())
  }

  @Test
  fun `details keeps the night but no stages when a packet is cut short`() {
    val cut = packetHead(bed, 17, 40) + ByteArray(6)
    val night = XiaomiSleepParsers.details(sleep, activityFile(nightHead(bed, wake) + cut)).single()
    assertTrue(night.stages.isEmpty())
  }

  @Test
  fun `details v5 skips its extra series before the stages`() {
    val id = fileId(version = 5, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.DETAILS)
    val head = LittleEndianBytes().raw(0x00, 0x00).u8(0).u32(bed).u32(wake).raw(ByteArray(17)).toByteArray()
    val stages = stagePacket(bed, 17, (1 shl 12) or 15)
    val night = XiaomiSleepParsers.details(id, activityFile(head + stages)).single()
    assertEquals(SleepStages.LIGHT, night.stages.single().stage)
  }

  @Test
  fun `details rejects an unknown version`() {
    val id = fileId(version = 8, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.DETAILS)
    assertThrows(UnsupportedFile::class.java) { XiaomiSleepParsers.details(id, activityFile(ByteArray(16))) }
  }

  @Test
  fun `stages file maps the vendor codes to sleep stages and closes the last at wake time`() {
    val id = fileId(version = 2, subtype = XiaomiFileId.SLEEP_STAGES, detail = XiaomiFileId.DETAILS)
    val body = stagesFileHead(duration = 480, bed = bed, wake = wake) +
      change(bed, 3) + change(bed + 3600, 2) + change(bed + 7200, 4) + change(bed + 9000, 5) + change(bed + 9600, 0) + change(bed + 9700, 9)
    val night = XiaomiSleepParsers.stagesFile(id, activityFile(body)).single()
    assertEquals(
      listOf(SleepStages.LIGHT, SleepStages.DEEP, SleepStages.REM, SleepStages.AWAKE, SleepStages.OUT_OF_BED, SleepStages.UNKNOWN),
      night.stages.map { it.stage }
    )
    assertEquals(instant(3600), night.stages[0].end)
    assertEquals(instant(8 * 3600), night.stages.last().end)
  }

  @Test
  fun `stages file returns nothing for a zero duration or a reversed night`() {
    val id = fileId(version = 2, subtype = XiaomiFileId.SLEEP_STAGES, detail = XiaomiFileId.DETAILS)
    assertTrue(XiaomiSleepParsers.stagesFile(id, activityFile(stagesFileHead(0, bed, wake))).isEmpty())
    assertTrue(XiaomiSleepParsers.stagesFile(id, activityFile(stagesFileHead(480, wake, bed))).isEmpty())
  }

  @Test
  fun `stages file rejects an unknown version`() {
    val id = fileId(version = 3, subtype = XiaomiFileId.SLEEP_STAGES, detail = XiaomiFileId.DETAILS)
    assertThrows(UnsupportedFile::class.java) { XiaomiSleepParsers.stagesFile(id, activityFile(ByteArray(0))) }
  }

  private fun nightHead(bedSeconds: Long, wakeSeconds: Long): ByteArray =
    LittleEndianBytes().u8(0).u8(0).u32(bedSeconds).u32(wakeSeconds).toByteArray()

  private fun packetHead(seconds: Long, type: Int, length: Int): ByteArray =
    LittleEndianBytes().raw(0xfb, 0xfa, 0xfc, 0xff).u8(0).u64(seconds).u8(0).u8(type).raw(length shr 8, length and 0xff).toByteArray()

  private fun stagePacket(seconds: Long, type: Int, vararg values: Int): ByteArray {
    val data = values.flatMap { listOf((it shr 8) and 0xff, it and 0xff) }.map { it.toByte() }.toByteArray()
    return packetHead(seconds, type, data.size) + data
  }

  private fun stagesFileHead(duration: Int, bed: Long, wake: Long): ByteArray =
    LittleEndianBytes().raw(ByteArray(7)).u16(duration).u32(bed).u32(wake).raw(ByteArray(12)).toByteArray()

  private fun change(seconds: Long, code: Int): ByteArray = LittleEndianBytes().u32(seconds).u8(code).toByteArray()
}
