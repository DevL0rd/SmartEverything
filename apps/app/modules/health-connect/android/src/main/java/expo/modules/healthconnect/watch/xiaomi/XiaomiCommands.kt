package expo.modules.healthconnect.watch.xiaomi

import android.os.Build
import expo.modules.healthconnect.watch.ProtoMessage
import expo.modules.healthconnect.watch.ProtoWriter
import expo.modules.healthconnect.watch.parseProto
import java.util.Locale

class XiaomiCommand(val type: Int, val subtype: Int, val body: ProtoMessage) {
  val status: Int? get() = body.int(STATUS)

  fun part(field: Int): ProtoMessage? = body.message(field)

  companion object {
    const val AUTH = 3
    const val SYSTEM = 4
    const val HEALTH = 10
    const val STATUS = 100

    fun parse(bytes: ByteArray): XiaomiCommand {
      val message = parseProto(bytes)
      val type = message.int(1) ?: throw IllegalArgumentException("a watch command without a type")
      return XiaomiCommand(type, message.int(2) ?: 0, message)
    }
  }
}

class BatteryReading(val level: Int, val charging: Boolean?)

class DeviceInformation(val serial: String, val firmware: String, val model: String)

class DeviceStateReading(val battery: Int?, val charging: Boolean?, val worn: Boolean?)

class RealtimeReading(val steps: Int?, val heartRate: Int?, val calories: Int?)

object XiaomiCommands {
  const val TYPE_AUTH = 1
  const val TYPE_SYSTEM = 2
  const val TYPE_HEALTH = 8
  const val AUTH_NONCE = 26
  const val AUTH_CONFIRM = 27
  const val SYSTEM_BATTERY = 1
  const val SYSTEM_DEVICE_INFO = 2
  const val SYSTEM_DEVICE_STATE_GET = 78
  const val SYSTEM_DEVICE_STATE = 79
  const val HEALTH_REALTIME_START = 45
  const val HEALTH_REALTIME_STOP = 46
  const val HEALTH_REALTIME_EVENT = 47
  private const val COMPANION_UNKNOWN_3 = 224L

  fun simple(type: Int, subtype: Int): ByteArray =
    ProtoWriter().varint(1, type.toLong()).varint(2, subtype.toLong()).toByteArray()

  fun nonce(phoneNonce: ByteArray, phoneId: String?): ByteArray {
    val verify = ProtoWriter().bytes(1, phoneNonce)
    if (!phoneId.isNullOrBlank()) {
      verify.string(2, phoneId)
    }
    return command(TYPE_AUTH, AUTH_NONCE, XiaomiCommand.AUTH, ProtoWriter().message(30, verify))
  }

  fun confirm(encryptedNonces: ByteArray, encryptedDeviceInfo: ByteArray): ByteArray {
    val confirm = ProtoWriter().bytes(1, encryptedNonces).bytes(2, encryptedDeviceInfo)
    return command(TYPE_AUTH, AUTH_CONFIRM, XiaomiCommand.AUTH, ProtoWriter().message(32, confirm))
  }

  fun companionDevice(): ByteArray = ProtoWriter()
    .varint(1, 0)
    .float(2, Build.VERSION.SDK_INT.toFloat())
    .string(3, Build.MODEL)
    .varint(4, COMPANION_UNKNOWN_3)
    .string(5, Locale.getDefault().language.take(2).uppercase(Locale.ROOT))
    .toByteArray()

  private fun command(type: Int, subtype: Int, field: Int, body: ProtoWriter): ByteArray =
    ProtoWriter().varint(1, type.toLong()).varint(2, subtype.toLong()).message(field, body).toByteArray()

  fun watchNonce(command: XiaomiCommand): Pair<ByteArray, ByteArray>? {
    val verify = command.part(XiaomiCommand.AUTH)?.message(31) ?: return null
    val nonce = verify.bytes(1) ?: return null
    val hmac = verify.bytes(2) ?: return null
    return nonce to hmac
  }

  fun battery(command: XiaomiCommand): BatteryReading? {
    val battery = command.part(XiaomiCommand.SYSTEM)?.message(2)?.message(1) ?: return null
    val level = battery.int(1) ?: return null
    return BatteryReading(level, battery.int(2)?.let { chargingOf(it) })
  }

  fun deviceInfo(command: XiaomiCommand): DeviceInformation? {
    val info = command.part(XiaomiCommand.SYSTEM)?.message(3) ?: return null
    return DeviceInformation(info.string(1).orEmpty(), info.string(2).orEmpty(), info.string(4).orEmpty())
  }

  fun basicState(command: XiaomiCommand): DeviceStateReading? {
    val state = command.part(XiaomiCommand.SYSTEM)?.message(48) ?: return null
    return DeviceStateReading(state.int(2), state.bool(1), state.bool(3))
  }

  fun pushedState(command: XiaomiCommand): DeviceStateReading? {
    val state = command.part(XiaomiCommand.SYSTEM)?.message(49) ?: return null
    return DeviceStateReading(null, state.int(1)?.let { chargingOf(it) }, state.int(2)?.let { it == 1 })
  }

  fun realtime(command: XiaomiCommand): RealtimeReading? {
    val stats = command.part(XiaomiCommand.HEALTH)?.message(39) ?: return null
    return RealtimeReading(stats.int(1), stats.int(4), stats.int(2))
  }

  private fun chargingOf(raw: Int): Boolean? = when (raw) {
    1 -> true
    2, 3 -> false
    else -> null
  }
}
