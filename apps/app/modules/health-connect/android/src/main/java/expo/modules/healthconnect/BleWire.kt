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
class WatchedContent(
  val serviceUuid: String? = null,
  val companyId: Int? = null,
  val dataPrefix: String? = null,
  val dataMask: String? = null
) {
  fun filter(): ScanFilter {
    val builder = ScanFilter.Builder()
    if (serviceUuid != null) {
      builder.setServiceUuid(ParcelUuid(UUID.fromString(serviceUuid)))
    } else if (companyId != null) {
      builder.setManufacturerData(companyId, (dataPrefix ?: "").fromHex(), (dataMask ?: "").fromHex())
    }
    return builder.build()
  }
}

@Serializable
class BleWatch(val devices: List<WatchedDevice>, val contentFilters: List<WatchedContent> = emptyList())

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
