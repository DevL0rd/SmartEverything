@file:UseSerializers(InstantSerializer::class)

package expo.modules.healthconnect

import android.bluetooth.le.ScanFilter
import android.os.ParcelUuid
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.Serializable
import kotlinx.serialization.UseSerializers

@Serializable
class WatchedDevice(val address: String, val serviceUuid: String, val dataPrefix: String, val dataMask: String) {
  fun filter(): ScanFilter = ScanFilter.Builder()
    .setServiceData(ParcelUuid(UUID.fromString(serviceUuid)), dataPrefix.fromHex(), dataMask.fromHex())
    .build()
}

@Serializable
class BleWatch(val devices: List<WatchedDevice>)

@Serializable
class BleAdvert(val address: String, val serviceUuid: String, val data: String, val rssi: Int?, val seenAt: Instant) {
  val identity: String get() = "$address:$serviceUuid:$data"
}

@Serializable
class BleAdvertRequest(val adverts: List<BleAdvert>)

@Serializable
class BleRelayResult(val accepted: Int, val ignored: Int, val readings: List<String>)

fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

fun String.fromHex(): ByteArray = chunked(2).map { it.toInt(16).toByte() }.toByteArray()
