package expo.modules.healthconnect.phone

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import java.util.concurrent.ConcurrentHashMap
import org.json.JSONArray
import org.json.JSONObject

data class BluetoothPeer(val address: String, val name: String?, val kind: String, val batteryPercent: Int?)

object PhoneBluetooth : PhoneDetailSource {
  override val sections: Set<PhoneSection> = setOf(PhoneSection.CONNECTIONS)

  private const val BATTERY_ACTION = "android.bluetooth.device.action.BATTERY_LEVEL_CHANGED"
  private const val BATTERY_EXTRA = "android.bluetooth.device.extra.BATTERY_LEVEL"
  private const val PERCENT = 100
  private val SEEDED_PROFILES = listOf(BluetoothProfile.A2DP, BluetoothProfile.HEADSET)
  private val SPEAKERS = setOf(
    BluetoothClass.Device.AUDIO_VIDEO_LOUDSPEAKER,
    BluetoothClass.Device.AUDIO_VIDEO_PORTABLE_AUDIO,
    BluetoothClass.Device.AUDIO_VIDEO_HIFI_AUDIO
  )
  private val peers = ConcurrentHashMap<String, BluetoothPeer>()
  private var receiver: BroadcastReceiver? = null

  fun kindOf(majorClass: Int, deviceClass: Int): String = when {
    majorClass == BluetoothClass.Device.Major.WEARABLE -> "watch"
    deviceClass == BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO || deviceClass == BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE -> "car"
    deviceClass == BluetoothClass.Device.AUDIO_VIDEO_HEADPHONES || deviceClass == BluetoothClass.Device.AUDIO_VIDEO_WEARABLE_HEADSET -> "headset"
    deviceClass in SPEAKERS -> "speaker"
    majorClass == BluetoothClass.Device.Major.COMPUTER -> "computer"
    else -> "other"
  }

  fun body(connected: Collection<BluetoothPeer>): JSONObject = JSONObject().put(
    "bluetooth",
    JSONArray(
      connected.sortedWith(compareBy({ it.name == null }, { it.name?.lowercase() }, { it.address })).map { peer ->
        JSONObject()
          .put("name", peer.name ?: JSONObject.NULL)
          .put("kind", peer.kind)
          .put("batteryPercent", peer.batteryPercent ?: JSONObject.NULL)
      }
    )
  )

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject? {
    if (!PhonePermissions.bluetooth(context)) return null
    observe(context)
    return body(peers.values)
  }

  fun reportsOn(action: String?, live: Boolean): Boolean = action != BATTERY_ACTION || live

  @Synchronized
  fun observe(context: Context) {
    if (receiver != null || !PhonePermissions.bluetooth(context)) return
    val app = context.applicationContext
    val changes = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (apply(intent) && reportsOn(intent.action, PhoneLive.active)) PhoneReporter.report(app)
      }
    }
    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
      addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
      addAction(BATTERY_ACTION)
    }
    app.registerReceiver(changes, filter, Context.RECEIVER_NOT_EXPORTED)
    receiver = changes
    seed(app)
  }

  @Synchronized
  fun stop(context: Context) {
    receiver?.let { context.applicationContext.unregisterReceiver(it) }
    receiver = null
    peers.clear()
  }

  private fun apply(intent: Intent): Boolean {
    if (intent.action == BluetoothAdapter.ACTION_STATE_CHANGED) {
      val off = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.STATE_ON) == BluetoothAdapter.STATE_OFF
      val had = peers.isNotEmpty()
      if (off) peers.clear()
      return off && had
    }
    val device = deviceOf(intent) ?: return false
    return when (intent.action) {
      BluetoothDevice.ACTION_ACL_CONNECTED -> add(device, null)
      BluetoothDevice.ACTION_ACL_DISCONNECTED -> peers.remove(device.address) != null
      else -> add(device, batteryOf(intent.getIntExtra(BATTERY_EXTRA, -1)))
    }
  }

  private fun add(device: BluetoothDevice, battery: Int?): Boolean {
    val previous = peers[device.address]
    val peer = BluetoothPeer(
      device.address,
      device.name,
      kindOf(device.bluetoothClass?.majorDeviceClass ?: 0, device.bluetoothClass?.deviceClass ?: 0),
      battery ?: previous?.batteryPercent
    )
    peers[device.address] = peer
    return peer != previous
  }

  private fun batteryOf(level: Int): Int? = level.takeIf { it in 0..PERCENT }

  private fun deviceOf(intent: Intent): BluetoothDevice? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    }

  private fun seed(context: Context) {
    val manager = context.getSystemService(BluetoothManager::class.java)
    val adapter = manager.adapter ?: return
    manager.getConnectedDevices(BluetoothProfile.GATT).forEach { add(it, null) }
    SEEDED_PROFILES.forEach { profile ->
      adapter.getProfileProxy(
        context,
        object : BluetoothProfile.ServiceListener {
          override fun onServiceConnected(profile: Int, proxy: BluetoothProfile) {
            val changed = proxy.connectedDevices.map { add(it, null) }.any { it }
            adapter.closeProfileProxy(profile, proxy)
            if (changed) PhoneReporter.report(context)
          }

          override fun onServiceDisconnected(profile: Int) = Unit
        },
        profile
      )
    }
  }
}
