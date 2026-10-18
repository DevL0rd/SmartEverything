package expo.modules.healthconnect.watch

import android.content.Context
import expo.modules.healthconnect.HubJson
import kotlinx.serialization.Serializable

@Serializable
class WeatherNow(
  val code: Int,
  val temperatureC: Int,
  val humidityPercent: Int,
  val windKmh: Double,
  val windDirection: Int?,
  val uvIndex: Int?,
  val aqi: Int?,
  val aqiLabel: String,
  val pressureHpa: Double?
)

@Serializable
class WeatherDay(
  val code: Int,
  val nightCode: Int,
  val minC: Int,
  val maxC: Int,
  val aqi: Int?,
  val sunrise: String?,
  val sunset: String?
)

@Serializable
class WeatherHour(val code: Int, val temperatureC: Int, val windKmh: Double, val windDirection: Int?)

@Serializable
class WatchWeather(
  val place: String,
  val timeZone: String,
  val publishedAt: String,
  val now: WeatherNow,
  val days: List<WeatherDay>,
  val hours: List<WeatherHour>
) {
  companion object {
    private const val PREFERENCES = "expo.modules.healthconnect.watch-weather"

    fun save(context: Context, weather: WatchWeather) {
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString("latest", HubJson.encode(weather)).apply()
    }

    fun latest(context: Context): WatchWeather? =
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("latest", null)?.let { HubJson.decode<WatchWeather>(it) }
  }
}
