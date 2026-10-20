package expo.modules.healthconnect.larq

import expo.modules.healthconnect.watch.ProtoFormatError
import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.parseProto
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import kotlin.math.abs
import kotlin.math.hypot

class LarqPage(val items: Int, val lastTimestamp: Long?)

sealed interface PageRead {
  class Page(val page: LarqPage) : PageRead

  data object Unsupported : PageRead

  class Unreadable(val reason: String) : PageRead
}

object LarqFrames {
  const val TYPE_URL_PREFIX = "type.googleapis.com/"
  const val CODE_SUCCESS = 1L
  const val CODE_NOT_SUPPORTED = 2L
  const val FIRST_PHONE_ID = 1000
  const val MAX_LIMIT = 10
  private const val TIME_REQUEST = "RequestSetCapTimeSettings"
  private const val ACCELEROMETER = "ResponseGetCapAccelerometerState"
  private const val NAME_PREFIX = "LARQ_"
  private const val NAME_DIGITS = 11
  private const val SERIAL_DIGITS = 16
  private const val BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
  private val SERIAL_LIMIT = BigInteger.ONE.shiftLeft(64)
  private val LOG_REQUESTS = mapOf(
    "tof" to "RequestGetCapTofLog",
    "activation" to "RequestGetCapActivationLog",
    "state" to "RequestGetCapStateLog",
    "fault" to "RequestGetCapFaultLog",
    "activation_adc" to "RequestGetActivationCapAdcLog",
    "charging_adc" to "RequestGetChargingCapAdcLog"
  )

  fun setTime(requestId: Int, epochMilliseconds: Long): ByteArray {
    require(epochMilliseconds >= 1) { "The time must be positive, got $epochMilliseconds" }
    return request(requestId, TIME_REQUEST, message(1, varint(1, epochMilliseconds)))
  }

  fun log(requestId: Int, log: String, fromTimestamp: Long, limit: Int): ByteArray {
    val name = LOG_REQUESTS[log] ?: throw IllegalArgumentException("$log is not a log the cap keeps")
    require(fromTimestamp >= 0) { "The log cursor must not be negative, got $fromTimestamp" }
    require(limit in 1..MAX_LIMIT) { "The page size must be from 1 to $MAX_LIMIT, got $limit" }
    return request(requestId, name, message(1, varint(1, fromTimestamp) + fixed32(2, limit.toLong())))
  }

  fun requestIdOf(frame: ByteArray): Long? = try {
    parseProto(frame).varint(1)
  } catch (ignored: ProtoFormatError) {
    null
  }

  fun isSuccess(frame: ByteArray): Boolean = try {
    parseProto(frame).varint(2) == CODE_SUCCESS
  } catch (ignored: ProtoFormatError) {
    false
  }

  fun scanPage(frame: ByteArray): PageRead {
    val message = try {
      parseProto(frame)
    } catch (ignored: ProtoFormatError) {
      return PageRead.Unreadable("the reply is not a valid frame")
    }
    when (val code = message.varint(2) ?: 0L) {
      CODE_SUCCESS -> Unit
      CODE_NOT_SUPPORTED -> return PageRead.Unsupported
      else -> return PageRead.Unreadable("the bottle answered with failure code $code")
    }
    val body = message.message(3)?.bytes(2) ?: return PageRead.Page(LarqPage(0, null))
    val items = try {
      parseProto(body).all(1).map { parseProto(it).varint(1) ?: 0L }
    } catch (ignored: ProtoFormatError) {
      return PageRead.Unreadable("the log rows could not be read")
    }
    return PageRead.Page(LarqPage(items.size, items.maxOrNull()))
  }

  fun nextCursor(from: Long, limit: Int, page: LarqPage): Long? {
    val last = page.lastTimestamp
    return if (page.items < limit || last == null || last <= from) null else last
  }

  fun gateAllows(frame: ByteArray, toleranceG: Double): Boolean {
    val reading = try {
      accelerometerOf(frame)
    } catch (ignored: ProtoFormatError) {
      null
    } ?: return false
    val (x, y, z) = reading
    val flat = abs(x) <= toleranceG && abs(y) <= toleranceG
    val upright = flat && z >= 1 - toleranceG
    return upright && abs(hypot(hypot(x, y), z) - 1) <= toleranceG
  }

  fun serialOfName(name: String): String? {
    if (!name.startsWith(NAME_PREFIX) || name.length != NAME_PREFIX.length + NAME_DIGITS) return null
    var value = BigInteger.ZERO
    for (digit in name.substring(NAME_PREFIX.length)) {
      val index = BASE62.indexOf(digit)
      if (index < 0) return null
      value = value.multiply(BigInteger.valueOf(BASE62.length.toLong())).add(BigInteger.valueOf(index.toLong()))
    }
    if (value >= SERIAL_LIMIT) return null
    return value.toString(16).uppercase().padStart(SERIAL_DIGITS, '0')
  }

  private fun accelerometerOf(frame: ByteArray): Triple<Double, Double, Double>? {
    val message = parseProto(frame)
    val any = message.message(3)
    if (message.varint(2) != CODE_SUCCESS || any == null) return null
    if (any.string(1) != "$TYPE_URL_PREFIX$ACCELEROMETER") return null
    val state = parseProto(any.bytes(2) ?: return null).message(1) ?: return null
    return Triple(floatOf(state, 1), floatOf(state, 2), floatOf(state, 3))
  }

  private fun floatOf(message: ProtoMessage, field: Int): Double =
    Float.fromBits((message.varint(field) ?: 0L).toInt()).toDouble()

  private fun request(requestId: Int, name: String, value: ByteArray): ByteArray {
    val any = bytes(1, "$TYPE_URL_PREFIX$name".toByteArray(Charsets.UTF_8)) + bytes(2, value)
    return fixed32(1, requestId.toLong() and 0xffffffffL) + message(2, any)
  }

  private fun tag(field: Int, wire: Int): ByteArray = rawVarint(((field shl 3) or wire).toLong())

  private fun rawVarint(value: Long): ByteArray {
    val out = ByteArrayOutputStream()
    var rest = value
    while (rest and 0x7fL.inv() != 0L) {
      out.write(((rest and 0x7f) or 0x80).toInt())
      rest = rest ushr 7
    }
    out.write(rest.toInt())
    return out.toByteArray()
  }

  private fun varint(field: Int, value: Long): ByteArray = if (value == 0L) ByteArray(0) else tag(field, 0) + rawVarint(value)

  private fun fixed32(field: Int, value: Long): ByteArray {
    if (value == 0L) return ByteArray(0)
    return tag(field, 5) + ByteArray(4) { ((value ushr (8 * it)) and 0xff).toByte() }
  }

  private fun bytes(field: Int, value: ByteArray): ByteArray =
    if (value.isEmpty()) ByteArray(0) else message(field, value)

  private fun message(field: Int, value: ByteArray): ByteArray = tag(field, 2) + rawVarint(value.size.toLong()) + value
}
