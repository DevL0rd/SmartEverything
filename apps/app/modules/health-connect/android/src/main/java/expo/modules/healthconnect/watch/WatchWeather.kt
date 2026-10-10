package expo.modules.healthconnect.watch

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

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

class WeatherDay(
  val code: Int,
  val nightCode: Int,
  val minC: Int,
  val maxC: Int,
  val aqi: Int?,
  val sunrise: String?,
  val sunset: String?
)

class WeatherHour(val code: Int, val temperatureC: Int, val windKmh: Double, val windDirection: Int?)

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

    fun of(json: JSONObject): WatchWeather {
      val now = json.getJSONObject("now")
      return WatchWeather(
        json.getString("place"),
        json.getString("timeZone"),
        json.getString("publishedAt"),
        WeatherNow(
          now.getInt("code"),
          now.getInt("temperatureC"),
          now.getInt("humidityPercent"),
          now.getDouble("windKmh"),
          optionalInt(now, "windDirection"),
          optionalInt(now, "uvIndex"),
          optionalInt(now, "aqi"),
          now.getString("aqiLabel"),
          if (now.isNull("pressureHpa")) null else now.getDouble("pressureHpa")
        ),
        list(json.getJSONArray("days")) {
          WeatherDay(
            it.getInt("code"), it.getInt("nightCode"), it.getInt("minC"), it.getInt("maxC"),
            optionalInt(it, "aqi"), optionalText(it, "sunrise"), optionalText(it, "sunset")
          )
        },
        list(json.getJSONArray("hours")) {
          WeatherHour(it.getInt("code"), it.getInt("temperatureC"), it.getDouble("windKmh"), optionalInt(it, "windDirection"))
        }
      )
    }

    fun save(context: Context, json: String) {
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().putString("latest", json).apply()
    }

    fun latest(context: Context): WatchWeather? =
      context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).getString("latest", null)?.let { of(JSONObject(it)) }

    private fun optionalInt(json: JSONObject, key: String): Int? = if (json.isNull(key)) null else json.getInt(key)

    private fun optionalText(json: JSONObject, key: String): String? = if (json.isNull(key)) null else json.getString(key)

    private fun <T> list(array: JSONArray, read: (JSONObject) -> T): List<T> =
      (0 until array.length()).map { read(array.getJSONObject(it)) }
  }
}
