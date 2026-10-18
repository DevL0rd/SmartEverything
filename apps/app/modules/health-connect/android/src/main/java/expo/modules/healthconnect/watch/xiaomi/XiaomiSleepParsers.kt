package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.SleepNight
import expo.modules.healthconnect.watch.SleepStage
import expo.modules.healthconnect.watch.SleepStages
import java.nio.BufferUnderflowException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.time.Instant

object XiaomiSleepParsers {
  private const val STAGE_MAGIC = 0xfffcfafb.toInt()
  private const val STAGE_PACKET = 17
  private const val STAGES = 17
  private val FLAG_ONLY = setOf(0x2, 0x3, 0x9, 0xc, 0xd, 0xe, 0xf)

  fun details(id: XiaomiFileId, file: ByteArray): List<SleepNight> {
    val headerSize = when (id.version) {
      1, 2, 3, 4 -> 1
      5 -> 2
      else -> throw UnsupportedFile(id, "sleep version ${id.version} is not known (this app reads 1 to 5)")
    }
    val buffer = ByteBuffer.wrap(file).order(ByteOrder.LITTLE_ENDIAN).apply { position(8) }
    val header = ByteArray(headerSize).also { buffer.get(it) }
    buffer.get()
    val bed = Instant.ofEpochSecond(buffer.getInt().toLong())
    val wake = Instant.ofEpochSecond(buffer.getInt().toLong())
    if (!wake.isAfter(bed)) {
      return emptyList()
    }
    val stages = try {
      skipSeries(id, header, buffer)
      stages(buffer)
    } catch (underflow: BufferUnderflowException) {
      emptyList()
    }
    return listOf(SleepNight(bed, wake, stages))
  }

  private fun skipSeries(id: XiaomiFileId, header: ByteArray, buffer: ByteBuffer) {
    var index = 3
    if (id.version >= 4) {
      if (FileAssembler.valid(header, index)) buffer.get()
      index += 1
    }
    if (id.version >= 5) {
      buffer.position(buffer.position() + 17)
      index += 5
    }
    val series = if (id.version >= 3) listOf(1, 1, 4) else listOf(1, 1)
    for (width in series) {
      if (FileAssembler.valid(header, index)) skipOne(id, buffer, width)
      index += 1
    }
  }

  private fun skipOne(id: XiaomiFileId, buffer: ByteBuffer, width: Int) {
    buffer.getShort()
    val count = buffer.getShort().toInt()
    if (count > 0) {
      if (id.version >= 2) buffer.getInt()
      buffer.position(buffer.position() + count * width)
    }
  }

  private fun stages(buffer: ByteBuffer): List<SleepStage> {
    val stages = mutableListOf<SleepStage>()
    while (buffer.remaining() >= STAGE_PACKET && seekPacket(buffer)) {
      buffer.get()
      val time = buffer.getLong()
      buffer.get()
      val type = buffer.get().toInt() and 0xff
      val length = ((buffer.get().toInt() and 0xff) shl 8) or (buffer.get().toInt() and 0xff)
      if (type in FLAG_ONLY) continue
      val data = ByteArray(length).also { buffer.get(it) }
      if (type == STAGES) stages.addAll(stagePacket(time, data))
    }
    return stages
  }

  private fun seekPacket(buffer: ByteBuffer): Boolean {
    while (buffer.remaining() >= STAGE_PACKET) {
      if (buffer.getInt() == STAGE_MAGIC) return true
      buffer.position(buffer.position() - 3)
    }
    return false
  }

  private fun stagePacket(seconds: Long, data: ByteArray): List<SleepStage> {
    val big = ByteBuffer.wrap(data).order(ByteOrder.BIG_ENDIAN)
    var at = Instant.ofEpochSecond(seconds)
    return (0 until data.size / 2).map {
      val value = big.short.toInt() and 0xffff
      val end = at.plusSeconds((value and 0xfff) * 60L)
      SleepStage(at, end, rawStage(value shr 12)).also { at = end }
    }
  }

  private fun rawStage(raw: Int): Int = when (raw) {
    0 -> SleepStages.AWAKE
    1 -> SleepStages.LIGHT
    2 -> SleepStages.DEEP
    3 -> SleepStages.REM
    4 -> SleepStages.OUT_OF_BED
    else -> SleepStages.UNKNOWN
  }

  fun stagesFile(id: XiaomiFileId, file: ByteArray): List<SleepNight> {
    if (id.version != 2) {
      throw UnsupportedFile(id, "sleep stages version ${id.version} is not known (this app reads 2)")
    }
    val buffer = FileAssembler.body(file)
    buffer.position(buffer.position() + 7)
    val duration = buffer.getShort().toInt()
    val bed = Instant.ofEpochSecond(buffer.getInt().toLong())
    val wake = Instant.ofEpochSecond(buffer.getInt().toLong())
    if (duration == 0 || bed.epochSecond == 0L || !wake.isAfter(bed)) {
      return emptyList()
    }
    buffer.position(buffer.position() + 3 + 8 + 1)
    val changes = mutableListOf<Pair<Instant, Int>>()
    while (buffer.remaining() >= 5) {
      changes.add(Instant.ofEpochSecond(buffer.getInt().toLong()) to stageFromCode(buffer.get().toInt() and 0xff))
    }
    val stages = changes.mapIndexed { index, (start, stage) ->
      SleepStage(start, changes.getOrNull(index + 1)?.first ?: wake, stage)
    }
    return listOf(SleepNight(bed, wake, stages))
  }

  private fun stageFromCode(code: Int): Int = when (code) {
    2 -> SleepStages.DEEP
    3 -> SleepStages.LIGHT
    4 -> SleepStages.REM
    5 -> SleepStages.AWAKE
    0 -> SleepStages.OUT_OF_BED
    else -> SleepStages.UNKNOWN
  }
}
