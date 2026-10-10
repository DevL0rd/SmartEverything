package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.KindSample
import expo.modules.healthconnect.watch.MinuteSample
import expo.modules.healthconnect.watch.RestingHeartRate
import expo.modules.healthconnect.watch.SampleKind
import expo.modules.healthconnect.watch.SpotKind
import expo.modules.healthconnect.watch.SpotSample
import java.nio.ByteBuffer
import java.time.Instant

private class Groups(private val header: ByteArray, private val buffer: ByteBuffer) {
  private var group = -1
  private var bits = 0
  private var value = 0

  fun reset() {
    group = -1
    bits = 0
    value = 0
  }

  fun next(size: Int): Boolean {
    group += 1
    if (group >= header.size * 2) {
      consume(size)
      return false
    }
    if (nibble() and 8 == 0) {
      return false
    }
    bits = size
    value = consume(size)
    return true
  }

  fun has(index: Int): Boolean = nibble() and (1 shl (2 - index)) != 0

  fun get(index: Int, size: Int): Int {
    val shift = bits - index - size
    return (value ushr shift) and ((1 shl size) - 1)
  }

  private fun consume(size: Int): Int = when (size) {
    8 -> buffer.get().toInt() and 0xff
    16 -> buffer.short.toInt() and 0xffff
    else -> throw IllegalArgumentException("unsupported group of $size bits")
  }

  private fun nibble(): Int {
    val byte = header[group / 2].toInt()
    return if (group % 2 == 0) (byte and 0xf0) shr 4 else byte and 0x0f
  }
}

private class MinuteReader(private val groups: Groups, private val buffer: ByteBuffer, private val version: Int) {
  fun read(time: Instant): MinuteSample {
    groups.reset()
    var extra = 0
    var steps: Int? = null
    var kcal: Int? = null
    var meters: Int? = null
    var heartRate: Int? = null
    if (groups.next(16)) {
      if (groups.has(1)) extra = groups.get(1, 1)
      if (groups.has(2)) steps = groups.get(2, 14)
    }
    if (groups.next(8) && groups.has(1)) kcal = groups.get(2, 6)
    groups.next(8)
    if (groups.next(16) && groups.has(0)) meters = groups.get(0, 16)
    if (groups.next(8) && groups.has(0)) heartRate = groups.get(0, 8)
    groups.next(8)
    groups.next(16)
    val (spo2, stress) = vitals()
    if (extra == 1) buffer.get()
    if (version >= 4) {
      groups.next(16)
      groups.next(16)
    }
    return MinuteSample(time, steps, kcal, meters, heartRate, spo2, stress)
  }

  private fun vitals(): Pair<Int?, Int?> {
    if (version < 3) {
      return null to null
    }
    val spo2 = if (groups.next(8) && groups.has(0)) groups.get(0, 8) else null
    val stress = if (groups.next(8) && groups.has(0)) groups.get(0, 8).takeIf { it != 255 } else null
    return spo2 to stress
  }
}

object XiaomiDailyParsers {
  fun details(id: XiaomiFileId, file: ByteArray): List<MinuteSample> {
    val headerSize = when (id.version) {
      1, 2 -> 4
      3 -> 5
      4 -> 6
      else -> throw UnsupportedFile(id, "daily details version ${id.version} is not known (Gadgetbridge reads 1 to 4)")
    }
    val buffer = FileAssembler.body(file)
    val header = ByteArray(headerSize).also { buffer.get(it) }
    val reader = MinuteReader(Groups(header, buffer), buffer, id.version)
    val minutes = mutableListOf<MinuteSample>()
    var time = id.timestamp
    while (buffer.hasRemaining()) {
      minutes.add(reader.read(time))
      time = time.plusSeconds(60)
    }
    return minutes
  }

  private val SUMMARY_SLOT_BYTES = intArrayOf(
    4, 2, 1, 1, 1, 4, 1, 4, 1, 1, 1, 1, 3, 2, 2, 1,
    1, 4, 1, 4, 1, 2, 2, 1, 1, 1, 1, 2, 1, 1, 2, 2
  )
  private const val SLOT_RESTING = 3
  private const val SLOT_VITALITY = 27

  class DailySummary(val resting: List<RestingHeartRate>, val vitality: List<KindSample>)

  fun summary(id: XiaomiFileId, file: ByteArray): DailySummary {
    val (headerSize, slots) = when (id.version) {
      3, 4 -> 3 to 21
      5 -> 4 to 32
      else -> throw UnsupportedFile(id, "daily summary version ${id.version} is not known (Gadgetbridge reads 3 to 5)")
    }
    val buffer = FileAssembler.body(file)
    val header = ByteArray(headerSize).also { buffer.get(it) }
    val present = (0 until slots).takeWhile { slot -> buffer.remaining() >= SUMMARY_SLOT_BYTES[slot] }
    val values = present.map { slot -> readSlot(buffer, SUMMARY_SLOT_BYTES[slot]).takeIf { FileAssembler.valid(header, slot) } }
    val resting = values.getOrNull(SLOT_RESTING)?.takeIf { it in 25..200 }
    val vitality = values.getOrNull(SLOT_VITALITY)
    return DailySummary(
      listOfNotNull(resting?.let { RestingHeartRate(id.timestamp, it) }),
      listOfNotNull(vitality?.let { KindSample(SampleKind.VITALITY, id.timestamp, it) })
    )
  }

  private fun readSlot(buffer: ByteBuffer, bytes: Int): Int = when (bytes) {
    1 -> buffer.get().toInt() and 0xff
    2 -> buffer.short.toInt() and 0xffff
    3 -> (buffer.get().toInt() and 0xff) or ((buffer.get().toInt() and 0xff) shl 8) or ((buffer.get().toInt() and 0xff) shl 16)
    else -> buffer.getInt()
  }

  fun manual(id: XiaomiFileId, file: ByteArray): List<SpotSample> = when (id.version) {
    1 -> manualV1(id, file)
    2 -> manualV2(id, file)
    else -> throw UnsupportedFile(id, "spot readings version ${id.version} is not known (Gadgetbridge reads 1 and 2)")
  }

  private fun manualV1(id: XiaomiFileId, file: ByteArray): List<SpotSample> {
    val buffer = FileAssembler.body(file)
    if ((buffer.get().toInt() and 0xff) != 0xff || buffer.remaining() % 6 != 0) {
      throw UnsupportedFile(id, "spot readings v1 do not have the expected layout")
    }
    val samples = mutableListOf<SpotSample>()
    while (buffer.hasRemaining()) {
      val time = Instant.ofEpochSecond(buffer.getInt().toLong())
      val kind = when (buffer.get().toInt() and 0xff) {
        0x02 -> SpotKind.SPO2
        0x03 -> SpotKind.STRESS
        else -> throw UnsupportedFile(id, "spot readings v1 contain an unknown kind")
      }
      samples.add(SpotSample(time, kind, buffer.get().toInt() and 0xff))
    }
    return samples
  }

  private fun manualV2(id: XiaomiFileId, file: ByteArray): List<SpotSample> {
    val buffer = FileAssembler.body(file)
    val samples = mutableListOf<SpotSample>()
    while (buffer.hasRemaining()) {
      val time = Instant.ofEpochSecond(buffer.getInt().toLong())
      val type = buffer.get().toInt() and 0xff
      val kind = when (type) {
        0x11 -> SpotKind.HEART_RATE
        0x12 -> SpotKind.SPO2
        0x13 -> SpotKind.STRESS
        0x44 -> null.also { buffer.getInt() }
        else -> throw UnsupportedFile(id, "spot reading kind 0x%02x is not known".format(type))
      }
      val value = if (kind == null) 0 else buffer.get().toInt() and 0xff
      if (kind != null && value != 0) samples.add(SpotSample(time, kind, value))
    }
    return samples
  }
}
