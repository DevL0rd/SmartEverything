package expo.modules.healthconnect.watch.xiaomi

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import expo.modules.healthconnect.watch.LinkListener
import expo.modules.healthconnect.watch.SppLink
import expo.modules.healthconnect.watch.VendorApp
import expo.modules.healthconnect.watch.VendorApps
import expo.modules.healthconnect.watch.WatchConnection
import expo.modules.healthconnect.watch.ActionOutcome
import expo.modules.healthconnect.watch.WatchAction
import expo.modules.healthconnect.watch.WatchRequest
import expo.modules.healthconnect.watch.WatchContext
import expo.modules.healthconnect.watch.WatchFamily
import expo.modules.healthconnect.watch.WatchModel
import expo.modules.healthconnect.watch.WatchPhase
import expo.modules.healthconnect.watch.WatchTransport

class BondedWatch(val name: String, val type: Int, val bonded: Boolean, val uuids: List<String>) {
  val describe: String
    get() = "name \"$name\", ${typeName()}, ${if (bonded) "bonded" else "NOT bonded to this phone"}, " +
      "services ${if (uuids.isEmpty()) "not cached" else uuids.joinToString()}"

  fun offersSerialPort(): Boolean = uuids.any { it.equals(SppLink.SERIAL_PORT.toString(), ignoreCase = true) }

  private fun typeName(): String = when (type) {
    BluetoothDevice.DEVICE_TYPE_CLASSIC -> "Bluetooth classic"
    BluetoothDevice.DEVICE_TYPE_LE -> "Bluetooth LE"
    BluetoothDevice.DEVICE_TYPE_DUAL -> "Bluetooth classic + LE"
    else -> "unknown Bluetooth type"
  }
}

object XiaomiFamily : WatchFamily {
  override val id = "xiaomi"
  override val label = "Xiaomi and Redmi watches and bands"
  override val vendorApps = listOf(
    VendorApp("com.xiaomi.wearable", "Mi Fitness"),
    VendorApp("com.mi.health", "Mi Fitness (China)")
  )

  override fun recognise(advertisedName: String): WatchModel? = XiaomiModels.byName(advertisedName)?.let {
    WatchModel(id, it.label, if (it.link == XiaomiLink.BLE) WatchTransport.GATT else WatchTransport.SPP)
  }

  override fun connect(watch: WatchContext): WatchConnection {
    val bonded = bondedWatch(watch)
    val spec = XiaomiModels.byName(bonded.name)
    if (spec == null) {
      watch.sink.note("watch_not_recognised", "${bonded.describe}; trying the Xiaomi serial protocol")
    } else {
      watch.sink.note("watch_identified", "${spec.label}: ${bonded.describe}")
    }
    watch.sink.note("vendor_apps", VendorApps.describe(watch.context, vendorApps))
    return XiaomiConnection(watch, spec, transportOf(spec, bonded))
  }

  private fun transportOf(spec: XiaomiModelSpec?, bonded: BondedWatch): WatchTransport = when (spec?.link) {
    XiaomiLink.SPP -> WatchTransport.SPP
    XiaomiLink.BLE -> WatchTransport.GATT
    XiaomiLink.EITHER -> if (bonded.offersSerialPort()) WatchTransport.SPP else WatchTransport.GATT
    null -> if (bonded.type == BluetoothDevice.DEVICE_TYPE_LE) WatchTransport.GATT else WatchTransport.SPP
  }

  @SuppressLint("MissingPermission")
  private fun bondedWatch(watch: WatchContext): BondedWatch {
    val adapter = watch.context.getSystemService(BluetoothManager::class.java)?.adapter
    val device = adapter?.getRemoteDevice(watch.watch.address)
    return BondedWatch(
      device?.name ?: "(no name known to this phone)",
      device?.type ?: BluetoothDevice.DEVICE_TYPE_UNKNOWN,
      device?.bondState == BluetoothDevice.BOND_BONDED,
      device?.uuids?.map { it.uuid.toString() }.orEmpty()
    )
  }
}

class XiaomiConnection(
  private val watch: WatchContext,
  spec: XiaomiModelSpec?,
  private val transport: WatchTransport
) : WatchConnection, LinkListener {
  private val cipher = XiaomiCipher(spec?.checkTag ?: true)
  private val link: SppLink = SppLink(watch.context, watch.watch.address, watch.handler, this)
  private val session: XiaomiSession = XiaomiSession(watch, cipher, null) { channel, payload -> spp.send(channel, payload) }
  private val spp: XiaomiSpp = XiaomiSpp(link, watch.handler, cipher, session)
  private var stopping = false

  override fun start() {
    if (transport == WatchTransport.GATT) {
      watch.sink.failed("This watch talks Bluetooth LE, which the next app update adds; it is not connected yet", false)
      return
    }
    watch.sink.phase(WatchPhase.CONNECTING, "Opening the Bluetooth serial link to ${watch.watch.address}")
    link.open()
  }

  override fun stop() {
    stopping = true
    if (session.authenticated && session.live) {
      session.applyLive(false)
    }
    session.dispose()
    spp.dispose()
    link.close()
  }

  override fun setLive(on: Boolean) = session.applyLive(on)

  override fun refresh() = session.refresh()

  override fun sync(reason: String) = session.sync(reason)

  override fun perform(request: WatchRequest, reply: (ActionOutcome) -> Unit) {
    watch.handler.post { reply(session.perform(request)) }
  }

  override fun act(action: WatchAction): Boolean {
    if (!session.authenticated) {
      return false
    }
    watch.handler.post { session.act(action) }
    return true
  }

  override fun refused(reason: String) {
    session.dispose()
    spp.dispose()
    if (stopping) {
      return
    }
    val holders = VendorApps.holding(watch.context, XiaomiFamily.vendorApps)
    if (holders.isEmpty()) {
      watch.sink.failed("The watch refused the connection: $reason", true)
      return
    }
    val names = holders.joinToString(" and ") { it.label }
    watch.sink.failed(
      "The watch refused the connection, most likely because $names is using it. " +
        "Turn off $names's Nearby devices permission, then tap Reconnect now. ($reason)",
      true
    )
  }

  override fun opened() {
    watch.sink.note("link_opened", "serial link open, asking the protocol version")
    spp.begin()
  }

  override fun received(bytes: ByteArray) = spp.received(bytes)

  override fun closed(reason: String) {
    session.dispose()
    spp.dispose()
    cipher.reset()
    if (!stopping) {
      watch.sink.failed("The watch connection ended: $reason", true)
    }
  }
}
