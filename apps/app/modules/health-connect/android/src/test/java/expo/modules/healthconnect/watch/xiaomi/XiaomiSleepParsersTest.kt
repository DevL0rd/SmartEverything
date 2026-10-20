package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.LittleEndianBytes
import expo.modules.healthconnect.hex
import expo.modules.healthconnect.watch.SleepStage
import expo.modules.healthconnect.watch.SleepStages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Duration
import java.time.Instant

class XiaomiSleepParsersTest {
  private val sleep = fileId(version = 1, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.DETAILS)
  private val bed = FIXTURE_EPOCH
  private val wake = FIXTURE_EPOCH + 8 * 3600
  private val v6Head = hex(
    "e058d46a1c062100dffffc00e058d46a9c8dd46a00633c000000f8340000a458" +
    "d46a9c8dd46a310000002e00280041000000248dd46a7e002000000000003c00" +
    "d900fc5ad46a0000003f000000000000000000390000000000000000003c0000" +
    "000000000000003a000000000000000000380000000000000000003c00000000"
  )

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
  fun `details reads a version 6 night from a real watch file head and holds it while no stage packet is found`() {
    val id = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)
    val nights = XiaomiSleepParsers.details(id, v6Head)
    assertEquals(Instant.ofEpochSecond(1792301280L), nights.single().start)
    assertEquals(Instant.ofEpochSecond(1792314780L), nights.single().end)
    assertTrue(nights.single().stages.isEmpty())
    assertTrue(XiaomiSleepParsers.awaitsStages(id, nights))
    assertFalse(XiaomiSleepParsers.awaitsStages(fileId(version = 5, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.DETAILS), nights))
  }

  @Test
  fun `details v6 reads the real night whose final stage packet supersedes the interim one and matches the watch totals`() {
    val id = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)
    val night = XiaomiSleepParsers.details(id, resource("sleep-v6-night-head") + resource("sleep-v6-night-interim-stages") + resource("sleep-v6-night-final-stages")).single()
    assertEquals(Instant.parse("2026-10-18T16:30:00Z"), night.start)
    assertEquals(Instant.parse("2026-10-19T05:58:00Z"), night.end)
    assertEquals(35, night.stages.size)
    assertEquals(night.start, night.stages.first().start)
    assertEquals(night.end, night.stages.last().end)
    assertTrue(night.stages.zipWithNext().all { (a, b) -> a.end == b.start })
    assertEquals(mapOf(SleepStages.AWAKE to 53L, SleepStages.LIGHT to 507L, SleepStages.DEEP to 87L, SleepStages.REM to 161L), minutesByStage(night.stages))
    assertFalse(XiaomiSleepParsers.awaitsStages(id, listOf(night)))
  }

  @Test
  fun `details v6 holds a real night whose only stage packet is the interim one that stops before wake time`() {
    val id = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)
    val nights = XiaomiSleepParsers.details(id, resource("sleep-v6-night-head") + resource("sleep-v6-night-interim-stages"))
    assertEquals(Instant.parse("2026-10-19T05:58:00Z"), nights.single().end)
    assertTrue(nights.single().stages.isEmpty())
    assertTrue(XiaomiSleepParsers.awaitsStages(id, nights))
  }

  @Test
  fun `details v6 holds the real final stages when the watch totals beside them belong to the interim analysis`() {
    val id = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)
    val interimTotals = resource("sleep-v6-night-interim-stages").copyOfRange(0, 64)
    val finalStages = resource("sleep-v6-night-final-stages").let { it.copyOfRange(64, it.size) }
    val nights = XiaomiSleepParsers.details(id, resource("sleep-v6-night-head") + interimTotals + finalStages)
    assertTrue(nights.single().stages.isEmpty())
    assertTrue(XiaomiSleepParsers.awaitsStages(id, nights))
  }

  @Test
  fun `details v6 holds a real night the watch has not split into stages`() {
    val id = fileId(version = 6, subtype = XiaomiFileId.SLEEP, detail = XiaomiFileId.SUMMARY)
    val nights = XiaomiSleepParsers.details(id, resource("sleep-v6-unanalysed-head") + resource("sleep-v6-unanalysed-stages"))
    assertEquals(Instant.parse("2026-10-16T06:20:00Z"), nights.single().start)
    assertEquals(Instant.parse("2026-10-16T08:52:00Z"), nights.single().end)
    assertTrue(nights.single().stages.isEmpty())
    assertTrue(XiaomiSleepParsers.awaitsStages(id, nights))
  }

  @Test
  fun `details keeps each stage once when the watch writes an interim packet and then the whole night from bed time`() {
    val night = (0 until 35).map { (listOf(1, 2, 1, 3)[it % 4] shl 12) or (5 + it % 7) }
    val earlierNight = packetHead(bed - 86_400, 17, 0)
    val interim = stagePacket(bed, 17, *night.take(13).toIntArray())
    val whole = stagePacket(bed, 17, *night.toIntArray())
    val file = activityFile(nightHead(bed, wake) + earlierNight + hex("00 01") + interim + hex("02 03 04") + whole)
    val stages = XiaomiSleepParsers.details(sleep, file).single().stages
    assertEquals(35, stages.size)
    assertEquals(35, stages.map { it.start }.toSet().size)
    assertEquals(instant(), stages.first().start)
    assertEquals(instant(night.sumOf { it and 0xfff } * 60L), stages.last().end)
    assertTrue(stages.zipWithNext().all { (a, b) -> a.end == b.start })
  }

  @Test
  fun `details keeps both packets when the second one continues after the first`() {
    val first = stagePacket(bed, 17, (1 shl 12) or 30, (2 shl 12) or 30)
    val second = stagePacket(bed + 3600, 17, (3 shl 12) or 20)
    val stages = XiaomiSleepParsers.details(sleep, activityFile(nightHead(bed, wake) + first + second)).single().stages
    assertEquals(listOf(SleepStages.LIGHT, SleepStages.DEEP, SleepStages.REM), stages.map { it.stage })
    assertEquals(instant(80 * 60), stages.last().end)
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

  private fun resource(name: String): ByteArray =
    checkNotNull(javaClass.getResourceAsStream("/xiaomi/$name.bin")) { "the $name resource is missing" }.use { it.readBytes() }

  private fun minutesByStage(stages: List<SleepStage>): Map<Int, Long> =
    stages.groupBy { it.stage }.mapValues { (_, list) -> list.sumOf { Duration.between(it.start, it.end).toMinutes() } }

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
