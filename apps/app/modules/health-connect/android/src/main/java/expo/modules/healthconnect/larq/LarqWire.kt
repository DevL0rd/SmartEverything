package expo.modules.healthconnect.larq

import kotlinx.serialization.Serializable

@Serializable
class BottleGate(val kind: String, val toleranceG: Double)

@Serializable
class BottleStep(
  val kind: String,
  val name: String,
  val requestHex: String? = null,
  val gate: BottleGate? = null,
  val log: String? = null,
  val fromTimestamp: Long? = null,
  val limit: Int? = null,
  val what: String? = null
)

@Serializable
class BottlePlan(val serial: String, val steps: List<BottleStep>)

@Serializable
class PhoneBottle(val deviceId: String, val serial: String, val name: String, val plan: BottlePlan)

@Serializable
class PhoneBottles(val bottles: List<PhoneBottle>)

@Serializable
class BottleInformation(
  val manufacturer: String?,
  val model: String?,
  val serial: String?,
  val firmware: String?,
  val hardware: String?,
  val software: String?
)

@Serializable
class BatteryRead(val at: String, val pct: Int, val pushed: Boolean)

@Serializable
class CapResponse(val name: String, val at: String, val hex: String?, val timedOut: Boolean)

@Serializable
class SyncUpload(
  val trigger: String,
  val startedAt: String,
  val endedAt: String,
  val outcome: String,
  val detail: String?,
  val rssi: Int?,
  val dis: BottleInformation?,
  val batteryReads: List<BatteryRead>,
  val responses: List<CapResponse>
)

@Serializable
class SyncResult(val accepted: Int, val plan: BottlePlan)

object LarqHex {
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
