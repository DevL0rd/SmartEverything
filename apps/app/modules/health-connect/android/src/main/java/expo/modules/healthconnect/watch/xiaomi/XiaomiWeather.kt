package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.WatchWeather
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs

class UnmappedWeather(code: Int) : IllegalArgumentException("WMO weather code $code has no Xiaomi equivalent")

object XiaomiWeather {
  private const val TYPE = 10
  private const val FIELD = 12
  private const val SET_CURRENT = 0
  private const val DAILY = 1
  private const val HOURLY = 2
  private const val ADD_LOCATION = 7
  private const val SET_PREFS = 10
  const val CONDITIONS_WANTED = 3
  private const val CELSIUS = 1
  private const val DAYS = 7
  private const val HOURS = 23
  private const val SYMBOL = "℃"
  private val BEAUFORT = floatArrayOf(2f, 6f, 12f, 20f, 29f, 39f, 50f, 62f, 75f, 89f, 103f, 118f)
  private val STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx")

  private val CONDITIONS: Map<Int, Int> = mapOf(
    0 to 0,
    1 to 1, 2 to 1, 3 to 2,
    45 to 18, 48 to 18,
    51 to 7, 53 to 7, 55 to 7, 56 to 19, 57 to 19,
    61 to 7, 63 to 8, 65 to 10, 66 to 19, 67 to 19,
    71 to 14, 73 to 15, 75 to 16, 77 to 14,
    80 to 3, 81 to 3, 82 to 9,
    85 to 14, 86 to 16,
    95 to 4, 96 to 5, 99 to 5
  )

  fun commands(weather: WatchWeather): List<ByteArray> {
    val zone = ZoneId.of(weather.timeZone)
    val metadata = metadata(weather, zone)
    return listOf(
      command(SET_PREFS, ProtoWriter().message(6, ProtoWriter().varint(1, CELSIUS.toLong()))),
      command(ADD_LOCATION, ProtoWriter().message(5, location(weather))),
      command(SET_CURRENT, ProtoWriter().message(1, current(weather, metadata))),
      command(DAILY, ProtoWriter().message(2, forecast(metadata, weather.days.take(DAYS).map { day(it, zone) }))),
      command(HOURLY, ProtoWriter().message(2, forecast(metadata, weather.hours.take(HOURS).map { hour(it) })))
    )
  }

  private fun condition(code: Int): Int = CONDITIONS[code] ?: throw UnmappedWeather(code)

  private fun beaufort(kmh: Double): Int = BEAUFORT.count { it < kmh }

  private fun unit(value: Int, unit: String) = ProtoWriter().string(1, unit).sint(2, value)

  private fun range(from: Int, to: Int) = ProtoWriter().sint(1, from).sint(2, to)

  private fun key(place: String) = "accu:${abs(place.hashCode()) % 1_000_000}"

  private fun location(weather: WatchWeather) = ProtoWriter().string(1, key(weather.place)).string(2, weather.place)

  private fun metadata(weather: WatchWeather, zone: ZoneId) = ProtoWriter()
    .string(1, STAMP.format(Instant.parse(weather.publishedAt).atZone(zone)))
    .string(2, "")
    .string(3, weather.place)
    .string(4, key(weather.place))
    .varint(5, 1)

  private fun current(weather: WatchWeather, metadata: ProtoWriter): ProtoWriter {
    val now = weather.now
    val writer = ProtoWriter()
      .message(1, metadata)
      .varint(2, condition(now.code).toLong())
      .message(3, unit(now.temperatureC, SYMBOL))
      .message(4, unit(now.humidityPercent, "%"))
      .message(5, unit(beaufort(now.windKmh), (now.windDirection ?: 0).toString()))
      .message(6, unit(now.uvIndex ?: 0, ""))
      .message(7, unit(now.aqi ?: 0, now.aqiLabel))
      .message(8, ProtoWriter())
    now.pressureHpa?.let { writer.float(9, (it * 100).toFloat()) }
    return writer
  }

  private fun forecast(metadata: ProtoWriter, entries: List<ProtoWriter>): ProtoWriter {
    val list = ProtoWriter()
    entries.forEach { list.message(1, it) }
    return ProtoWriter().message(1, metadata).message(2, list)
  }

  private fun day(day: expo.modules.healthconnect.watch.WeatherDay, zone: ZoneId): ProtoWriter = ProtoWriter()
    .message(1, unit(day.aqi ?: 0, "Unknown"))
    .message(2, range(condition(day.code), condition(day.nightCode)))
    .message(3, range(day.maxC, day.minC))
    .string(4, SYMBOL)
    .message(5, ProtoWriter().string(1, stamp(day.sunrise, zone)).string(2, stamp(day.sunset, zone)))

  private fun hour(hour: expo.modules.healthconnect.watch.WeatherHour): ProtoWriter = ProtoWriter()
    .message(1, unit(0, "Unknown"))
    .message(2, range(0, condition(hour.code)))
    .message(3, range(0, hour.temperatureC))
    .string(4, SYMBOL)
    .message(6, unit(beaufort(hour.windKmh), (hour.windDirection ?: 0).toString()))

  private fun stamp(iso: String?, zone: ZoneId): String = iso?.let { STAMP.format(Instant.parse(it).atZone(zone)) }.orEmpty()

  private fun command(subtype: Int, body: ProtoWriter): ByteArray =
    ProtoWriter().varint(1, TYPE.toLong()).varint(2, subtype.toLong()).message(FIELD, body).toByteArray()

}
