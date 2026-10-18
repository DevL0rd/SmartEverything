package expo.modules.healthconnect.watch

import android.content.Context
import android.util.Log
import expo.modules.healthconnect.HubClient
import expo.modules.healthconnect.SyncFailure
import expo.modules.healthconnect.relayTarget
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

@Serializable
class WatchData(val weather: WatchWeather?, val user: WatchUser?)

object WatchHubData {
  private const val TAG = "SmartEverythingWatch"
  private const val PATH = "/api/watches/mine/data"
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  fun refresh(context: Context) {
    scope.launch {
      try {
        apply(context, HubClient(relayTarget(context)).get<WatchData>(PATH))
      } catch (failure: SyncFailure) {
        failed(failure.message.orEmpty())
      } catch (failure: Exception) {
        failed("${failure.javaClass.simpleName}: ${failure.message}")
      }
    }
  }

  private fun apply(context: Context, data: WatchData) {
    val weather = data.weather
    val user = data.user
    if (weather != null) {
      WatchWeather.save(context, weather)
      WatchActions.send(WatchAction.Weather(weather))
    }
    if (user != null) {
      WatchPhoneBridge.setUser(context, user)
    }
    WatchEvents.emit("data_refreshed", "weather ${if (weather != null) "updated" else "not available"}, details ${if (user != null) "updated" else "not available"}")
  }

  private fun failed(detail: String) {
    Log.w(TAG, "The watch data could not be refreshed: $detail")
    WatchEvents.emit("data_failed", detail)
  }
}
