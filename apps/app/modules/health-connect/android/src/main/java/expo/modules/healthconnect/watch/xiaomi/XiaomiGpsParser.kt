package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.watch.Route
import expo.modules.healthconnect.watch.RoutePoint
import java.time.Instant

object XiaomiGpsParser {
  fun route(id: XiaomiFileId, file: ByteArray): List<Route> {
    val size = when (id.version) {
      1 -> 12
      2 -> 18
      3 -> 26
      else -> throw UnsupportedFile(id, "GPS track version ${id.version} is not known (this app reads 1 to 3)")
    }
    val buffer = FileAssembler.body(file)
    buffer.get()
    if (buffer.remaining() % size != 0) {
      throw UnsupportedFile(id, "GPS track of ${buffer.remaining()} bytes is not a multiple of $size-byte points")
    }
    val points = (0 until buffer.remaining() / size).map {
      val time = Instant.ofEpochSecond(buffer.getInt().toLong() and 0xffffffffL)
      val longitude = buffer.float.toDouble()
      val latitude = buffer.float.toDouble()
      val accuracy = if (id.version >= 2) buffer.float.toDouble().also { buffer.getShort() } else null
      val altitude = if (id.version >= 3) buffer.float.toDouble().also { buffer.float } else null
      RoutePoint(time, latitude, longitude, altitude, accuracy?.takeIf { it >= 0 })
    }.filter { it.latitude in -90.0..90.0 && it.longitude in -180.0..180.0 && !(it.latitude == 0.0 && it.longitude == 0.0) }
    return if (points.isEmpty()) emptyList() else listOf(Route(id.timestamp, points))
  }
}
