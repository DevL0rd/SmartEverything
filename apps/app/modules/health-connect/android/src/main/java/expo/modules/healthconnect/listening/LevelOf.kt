package expo.modules.healthconnect.listening

import kotlin.math.log10
import kotlin.math.sqrt

object LevelOf {
  const val FULL_SCALE = 32_768.0
  const val FLOOR_DBFS = -120.0

  fun rms(samples: ShortArray): Double {
    if (samples.isEmpty()) {
      return 0.0
    }
    var sum = 0.0
    for (sample in samples) {
      val scaled = sample / FULL_SCALE
      sum += scaled * scaled
    }
    return sqrt(sum / samples.size)
  }

  fun dbfs(samples: ShortArray): Double = maxOf(FLOOR_DBFS, 20 * log10(rms(samples)))
}
