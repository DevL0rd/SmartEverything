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
import org.json.JSONException
import org.json.JSONObject

object WatchHubData {
  private const val TAG = "SmartEverythingWatch"
  private const val PATH = "/api/watches/mine/data"
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  fun refresh(context: Context) {
    scope.launch {
      try {
        apply(context, HubClient(relayTarget(context)).get(PATH))
      } catch (failure: SyncFailure) {
        failed(failure.message.orEmpty())
      } catch (failure: JSONException) {
        failed("the hub's answer could not be read: ${failure.message}")
      } catch (failure: Exception) {
        failed("${failure.javaClass.simpleName}: ${failure.message}")
      }
    }
  }

  private fun apply(context: Context, data: JSONObject) {
    val weather = data.optJSONObject("weather")
    val user = data.optJSONObject("user")
    if (weather != null) {
      WatchWeather.save(context, weather.toString())
      WatchActions.send(WatchAction.Weather(WatchWeather.of(weather)))
    }
    if (user != null) {
      WatchPhoneBridge.setUser(context, WatchUserStore.userOf(user))
    }
    WatchEvents.emit("data_refreshed", "weather ${if (weather != null) "updated" else "not available"}, details ${if (user != null) "updated" else "not available"}")
  }

  private fun failed(detail: String) {
    Log.w(TAG, "The watch data could not be refreshed: $detail")
    WatchEvents.emit("data_failed", detail)
  }
}
