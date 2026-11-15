package expo.modules.healthconnect.planner

import java.util.Random

class NoiseGenerator(private val colour: NoiseColour, seed: Long = System.nanoTime()) {
  private val random = Random(seed)
  private var b0 = 0.0
  private var b1 = 0.0
  private var b2 = 0.0
  private var b3 = 0.0
  private var b4 = 0.0
  private var b5 = 0.0
  private var b6 = 0.0
  private var brown = 0.0

  fun fill(buffer: ShortArray) {
    for (index in buffer.indices) {
      buffer[index] = (sample().coerceIn(-1.0, 1.0) * AMPLITUDE * Short.MAX_VALUE).toInt().toShort()
    }
  }

  private fun sample(): Double {
    val white = random.nextDouble() * 2.0 - 1.0
    return when (colour) {
      NoiseColour.WHITE -> white
      NoiseColour.PINK -> pink(white)
      NoiseColour.BROWN -> brown(white)
    }
  }

  private fun pink(white: Double): Double {
    b0 = 0.99886 * b0 + white * 0.0555179
    b1 = 0.99332 * b1 + white * 0.0750759
    b2 = 0.96900 * b2 + white * 0.1538520
    b3 = 0.86650 * b3 + white * 0.3104856
    b4 = 0.55000 * b4 + white * 0.5329522
    b5 = -0.7616 * b5 - white * 0.0168980
    val total = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362
    b6 = white * 0.115926
    return total * PINK_SCALE
  }

  private fun brown(white: Double): Double {
    brown = (brown + BROWN_STEP * white) / (1.0 + BROWN_STEP)
    return brown * BROWN_SCALE
  }

  private companion object {
    const val AMPLITUDE = 0.5
    const val PINK_SCALE = 0.18
    const val BROWN_STEP = 0.02
    const val BROWN_SCALE = 5.0
  }
}
