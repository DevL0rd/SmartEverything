package expo.modules.healthconnect.watch

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

@Serializable
class WatchData(val weather: WatchWeather?, val user: WatchUser?)

private class WatchDataRead(val weather: WatchWeatherSnapshot, val user: WatchUser?)

object WatchHubData {
  private const val TAG = "SmartEverythingWatch"
  private const val PATH = "/api/watches/mine/data"
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  private val reads = Mutex()
  @Volatile private var cached: WatchWeatherSnapshot? = null

  fun refresh(context: Context) {
    scope.launch {
      tryRefresh { apply(context, reads.withLock { read(context) }) }
    }
  }

  suspend fun weather(context: Context): WatchWeatherSnapshot = withContext(Dispatchers.IO) {
    reads.withLock {
      tryRefresh { read(context).weather } ?: cachedWeather(context)
    }
  }

  fun cachedWeather(context: Context): WatchWeatherSnapshot =
    cached ?: WatchWeatherSnapshot(0L, WatchWeather.latest(context)).let { cached ?: it }

  private suspend fun read(context: Context): WatchDataRead {
    val data = HubClient(relayTarget(context)).get<WatchData>(PATH)
    WatchWeather.save(context, data.weather)
    val snapshot = WatchWeatherSnapshot((cached?.version ?: 0L) + 1, data.weather)
    cached = snapshot
    return WatchDataRead(snapshot, data.user)
  }

  private suspend fun <T> tryRefresh(refresh: suspend () -> T): T? =
    try {
      refresh()
    } catch (cancelled: CancellationException) {
      throw cancelled
    } catch (failure: SyncFailure) {
      failed(failure.message.orEmpty())
      null
    } catch (failure: Exception) {
      failed("${failure.javaClass.simpleName}: ${failure.message}")
      null
    }

  private fun apply(context: Context, data: WatchDataRead) {
    val weather = data.weather
    val user = data.user
    WatchActions.send(WatchAction.Weather(weather))
    if (user != null) {
      WatchPhoneBridge.setUser(context, user)
    }
    WatchEvents.emit("data_refreshed", "weather ${if (weather.weather != null) "updated" else "not available"}, details ${if (user != null) "updated" else "not available"}")
  }

  private fun failed(detail: String) {
    Log.w(TAG, "The watch data could not be refreshed: $detail")
    WatchEvents.emit("data_failed", detail)
  }
}
