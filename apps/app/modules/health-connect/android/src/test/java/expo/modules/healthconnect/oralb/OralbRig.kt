package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.AdvertFilter
import expo.modules.healthconnect.toothbrush.Heard
import expo.modules.healthconnect.toothbrush.LinkPlan
import expo.modules.healthconnect.toothbrush.ReadPlace
import expo.modules.healthconnect.toothbrush.Subscription

object OralbRig {
  const val ADDRESS = "A4:C1:38:00:00:01"
  const val SERVICE = "a0f0ff00-5047-4d53-8208-4f72616c2d42"

  fun uuid(key: String): String = "a0f0$key-5047-4d53-8208-4f72616c2d42"

  fun plan(
    address: String = ADDRESS,
    deviceId: String = "33333333-3333-4333-8333-333333333333",
    live: Boolean = false,
    sync: Boolean = true
  ) = LinkPlan(
    deviceId = deviceId,
    address = address,
    transport = "gatt",
    brand = "oralb",
    bonded = false,
    adverts = AdvertFilter(220),
    prepare = emptyList(),
    subscriptions = if (live) listOf(Subscription(SERVICE, uuid("ff04"), "notify")) else emptyList(),
    reads = listOf(ReadPlace(SERVICE, uuid("ff02"))),
    sync = if (sync) listOf(ReadPlace(SERVICE, uuid("ff29"))) else emptyList(),
    initial = emptyList(),
    policy = "on_demand",
    holder = true
  )

  fun data(state: Int, seconds: Int = 0): ByteArray =
    byteArrayOf(8, 0x36, 0x52, state.toByte(), 0x32, 0, seconds.toByte(), 5, 0, 1, 0)

  fun heard(state: Int, address: String = ADDRESS, rssi: Int = -60, ageMs: Long = 0, seconds: Int = 0) =
    Heard(address, emptySet(), mapOf(220 to data(state, seconds)), rssi, ageMs)
}
