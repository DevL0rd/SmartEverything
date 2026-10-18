package expo.modules.healthconnect.voice

import kotlin.math.sqrt

object PcmLevel {
  private const val FULL_SCALE = 32768.0
  private const val GAIN = 4.0
  private const val BYTE_MASK = 0xFF
  private const val BITS_PER_BYTE = 8

  fun of(pcm: ShortArray): Double {
    var sum = 0.0
    for (sample in pcm) sum += sample.toDouble() * sample.toDouble()
    return scaled(sum, pcm.size)
  }

  fun ofLittleEndian(pcm: ByteArray, size: Int): Double {
    val samples = size / 2
    var sum = 0.0
    for (index in 0 until samples) {
      val low = pcm[index * 2].toInt() and BYTE_MASK
      val sample = (pcm[index * 2 + 1].toInt() shl BITS_PER_BYTE) or low
      sum += sample.toDouble() * sample.toDouble()
    }
    return scaled(sum, samples)
  }

  private fun scaled(sum: Double, count: Int): Double = minOf(1.0, sqrt(sum / maxOf(1, count)) / FULL_SCALE * GAIN)
}
