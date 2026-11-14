package expo.modules.healthconnect.planner

import android.net.Uri
import java.time.Instant

object RingKeys {
  private const val SNOOZE_MARK = "#snooze"

  fun snoozeOf(ringKey: String): String = ringKey + SNOOZE_MARK

  fun baseOf(ringKey: String): String = ringKey.removeSuffix(SNOOZE_MARK)

  fun isSnooze(ringKey: String): Boolean = ringKey.endsWith(SNOOZE_MARK)

  fun linkOf(scheme: String, ringKey: String): Uri =
    Uri.Builder().scheme(scheme).authority("clock").appendPath("ring").appendPath(baseOf(ringKey)).build()
}

object RingSnooze {
  fun ringOf(base: PhoneRing, now: Instant, minutes: Int): PhoneRing = PhoneRing(
    RingKeys.snoozeOf(base.ringKey),
    RingKind.TIMER,
    base.refId,
    now.plusSeconds(minutes * SECONDS_PER_MINUTE),
    base.sound,
    base.rampSeconds,
    base.vibrate,
    base.label,
    null,
    base.snoozeMinutes
  )

  private const val SECONDS_PER_MINUTE = 60L
}

object RingRamp {
  const val FLOOR = 0.05f

  fun volume(elapsedMillis: Long, rampSeconds: Int): Float {
    if (rampSeconds <= 0) {
      return 1f
    }
    val fraction = elapsedMillis.toFloat() / (rampSeconds * MILLIS_PER_SECOND)
    return fraction.coerceIn(0f, 1f).let { FLOOR + (1f - FLOOR) * it }
  }

  private const val MILLIS_PER_SECOND = 1000f
}
