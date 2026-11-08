package expo.modules.healthconnect.watch

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

class WatchWeatherSnapshot(val version: Long, val weather: WatchWeather?)

class WatchWeatherRequests(
  private val scope: CoroutineScope,
  private val fetch: suspend () -> WatchWeatherSnapshot,
  private val unavailable: () -> Unit,
  private val answer: (WatchWeather) -> Boolean
) {
  private var pending: Job? = null
  private var latestVersion = 0L

  fun request() {
    if (pending?.isActive == true) return
    pending = scope.launch { deliver(fetch(), unavailable) }
  }

  fun deliver(snapshot: WatchWeatherSnapshot, onUnavailable: () -> Unit = {}): Boolean {
    if (snapshot.version < latestVersion) return true
    latestVersion = snapshot.version
    val weather = snapshot.weather
    if (weather != null) return answer(weather)
    onUnavailable()
    return true
  }

  fun cancel() {
    pending?.cancel()
    pending = null
  }
}
