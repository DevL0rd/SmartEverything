package expo.modules.healthconnect.listening

import android.os.SystemClock
import android.util.Log
import java.util.concurrent.atomic.AtomicLong

class ListeningCounters(
  private val clock: () -> Long = SystemClock::elapsedRealtime,
  private val log: (String) -> Unit = { Log.d(TAG, it) }
) {
  private val listened = AtomicLong()
  private val fed = AtomicLong()
  private val runs = AtomicLong()
  private val opens = AtomicLong()
  private val rested = AtomicLong()
  private var restedSince = NOT_RESTING

  fun heard(samples: Int) {
    val before = listened.getAndAdd(samples.toLong())
    if (before / HOUR_SAMPLES != (before + samples) / HOUR_SAMPLES) {
      log(summary())
    }
  }

  fun spotterRan(samples: Int) {
    fed.addAndGet(samples.toLong())
    runs.incrementAndGet()
  }

  fun voiceOpened() {
    opens.incrementAndGet()
  }

  @Synchronized
  fun restBegan() {
    if (restedSince == NOT_RESTING) {
      restedSince = clock()
    }
  }

  @Synchronized
  fun restEnded() {
    if (restedSince != NOT_RESTING) {
      rested.addAndGet(clock() - restedSince)
      restedSince = NOT_RESTING
    }
  }

  @Synchronized
  fun snapshot(): Map<String, Double> {
    val heard = listened.get()
    val spotter = fed.get()
    val resting = if (restedSince == NOT_RESTING) 0L else clock() - restedSince
    return mapOf(
      "listeningSeconds" to heard / SAMPLES_PER_SECOND,
      "gatedOffSeconds" to (heard - spotter) / SAMPLES_PER_SECOND,
      "spotterSeconds" to spotter / SAMPLES_PER_SECOND,
      "spotterRuns" to runs.get().toDouble(),
      "voiceOpens" to opens.get().toDouble(),
      "restedSeconds" to (rested.get() + resting) / MS_PER_SECOND
    )
  }

  fun summary(): String = snapshot().entries.joinToString(" ", "listening counters: ") { "${it.key}=${"%.1f".format(java.util.Locale.ROOT, it.value)}" }

  companion object {
    val shared = ListeningCounters()

    private const val TAG = "SmartEverythingListening"
    private const val NOT_RESTING = -1L
    private const val SAMPLES_PER_SECOND = 16_000.0
    private const val MS_PER_SECOND = 1000.0
    private const val HOUR_SAMPLES = 16_000L * 3600
  }
}
