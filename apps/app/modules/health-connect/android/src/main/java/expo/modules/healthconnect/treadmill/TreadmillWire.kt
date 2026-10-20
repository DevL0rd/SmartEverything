package expo.modules.healthconnect.treadmill

import kotlinx.serialization.Serializable

@Serializable
class LinkDelivery(
  val service: String,
  val characteristic: String,
  val mode: String,
  val coalescePrefix: String?,
  val changeByte: Int?
)

@Serializable
class LinkWrite(val service: String, val characteristic: String, val writeType: String)

@Serializable
class Preamble(val characteristic: String, val hex: String)

@Serializable
class WriteStep(
  val characteristic: String,
  val service: String,
  val hex: String,
  val writeType: String,
  val pauseAfterMs: Int
)

@Serializable
class StatusRequest(
  val hex: String,
  val everyMs: Int,
  val stateByte: Int,
  val activeValues: List<Int>,
  val settleRequests: Int
)

@Serializable
class LinkPlan(
  val deviceId: String,
  val address: String,
  val family: String,
  val subscriptions: List<LinkDelivery>,
  val control: LinkWrite?,
  val preamble: Preamble?,
  val cccdPacingMs: Int,
  val writePacingMs: Int,
  val initial: List<WriteStep>,
  val statusRequest: StatusRequest?,
  val autoConnect: Boolean,
  val presence: Boolean,
  val holder: Boolean
)

@Serializable
class PhoneTreadmills(val treadmills: List<LinkPlan>)

@Serializable
class TreadmillFrame(val at: String, val characteristic: String, val hex: String)

@Serializable
class LinkReport(val phase: String, val rssi: Int?, val reconnects: Int, val detail: String?)

@Serializable
class FrameBatch(val frames: List<TreadmillFrame>, val link: LinkReport)

@Serializable
class BatchResult(val live: Boolean, val accepted: Int)

@Serializable
class GattCharacteristicDump(val uuid: String, val properties: List<String>, val value: String? = null)

@Serializable
class GattServiceDump(val uuid: String, val characteristics: List<GattCharacteristicDump>)

@Serializable
class GattDump(val name: String, val services: List<GattServiceDump>)

object TreadmillHex {
  private const val DIGITS = "0123456789abcdef"

  fun of(bytes: ByteArray): String {
    val builder = StringBuilder(bytes.size * 2)
    for (byte in bytes) {
      val value = byte.toInt() and 0xff
      builder.append(DIGITS[value shr 4]).append(DIGITS[value and 0x0f])
    }
    return builder.toString()
  }

  fun bytes(hex: String): ByteArray {
    require(hex.length % 2 == 0) { "A hex string needs an even number of digits, got ${hex.length}" }
    return ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
  }
}
