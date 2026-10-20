package expo.modules.healthconnect.toothbrush

import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.SystemClock
import expo.modules.healthconnect.oralb.OralbMatch
import expo.modules.healthconnect.sonicare.SonicareMatch

class Heard(
  val address: String,
  val services: Set<String>,
  val manufacturer: Map<Int, ByteArray> = emptyMap(),
  val rssi: Int = 0,
  val ageMs: Long = 0
)

interface BrushMatcher {
  val brand: String

  fun matching(heard: Heard, plans: List<LinkPlan>): LinkPlan?

  fun woken(context: Context, plan: LinkPlan, heard: List<Heard>)
}

class Wake(val plan: LinkPlan, val matcher: BrushMatcher, val heard: List<Heard>)

object BrushWake {
  private const val NANOS_PER_MS = 1_000_000L
  private val matchers: List<BrushMatcher> = listOf(SonicareMatch, OralbMatch)

  fun heard(context: Context, results: List<ScanResult>) {
    val plans = BrushStore(context).holding()
    if (plans.isEmpty()) return
    route(results.map(::heardOf), plans, matchers).forEach { it.matcher.woken(context, it.plan, it.heard) }
  }

  fun route(heard: List<Heard>, plans: List<LinkPlan>, matchers: List<BrushMatcher>): List<Wake> {
    val matched = heard.mapNotNull { advert ->
      matchers.firstNotNullOfOrNull { matcher ->
        matcher.matching(advert, plans.filter { it.brand == matcher.brand })?.let { Triple(it, matcher, advert) }
      }
    }
    return matched.groupBy { it.first.deviceId }.values.map { group ->
      Wake(group.first().first, group.first().second, group.map { it.third })
    }
  }

  private fun heardOf(result: ScanResult): Heard {
    val record = result.scanRecord
    val data = record?.manufacturerSpecificData
    val manufacturer = HashMap<Int, ByteArray>()
    if (data != null) {
      for (index in 0 until data.size()) manufacturer[data.keyAt(index)] = data.valueAt(index)
    }
    return Heard(
      address = result.device.address.uppercase(),
      services = record?.serviceUuids.orEmpty().map { it.uuid.toString().lowercase() }.toSet(),
      manufacturer = manufacturer,
      rssi = result.rssi,
      ageMs = maxOf(0L, (SystemClock.elapsedRealtimeNanos() - result.timestampNanos) / NANOS_PER_MS)
    )
  }
}
