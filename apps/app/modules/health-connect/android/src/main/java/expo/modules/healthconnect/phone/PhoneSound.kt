package expo.modules.healthconnect.phone

import android.content.Context
import android.database.ContentObserver
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.telephony.TelephonyManager
import expo.modules.healthconnect.media.NowPlaying
import expo.modules.healthconnect.watch.WatchNotificationListener
import org.json.JSONObject

class AudioRoute(val kind: String, val name: String?)

object PhoneSound : PhoneDetailSource {
  private const val MILLIS = 1000L
  private val BLUETOOTH = setOf(
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_HEARING_AID,
    AudioDeviceInfo.TYPE_BLE_HEADSET,
    AudioDeviceInfo.TYPE_BLE_SPEAKER,
    AudioDeviceInfo.TYPE_BLE_BROADCAST
  )
  private val WIRED = setOf(
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_LINE_ANALOG,
    AudioDeviceInfo.TYPE_LINE_DIGITAL
  )
  private val USB = setOf(AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_ACCESSORY, AudioDeviceInfo.TYPE_USB_HEADSET)
  private val ROUTE_ORDER = listOf("car", "bluetooth", "wired", "usb", "other", "speaker")

  override val sections = setOf(PhoneSection.SOUND)

  private val handler = Handler(Looper.getMainLooper())
  private var volumes: ContentObserver? = null
  private var devices: AudioDeviceCallback? = null

  fun routeKind(type: Int, address: String, carAddress: String?): String = when {
    type == AudioDeviceInfo.TYPE_BUS -> "car"
    type in BLUETOOTH -> if (address == carAddress) "car" else "bluetooth"
    type in WIRED -> "wired"
    type in USB -> "usb"
    type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    else -> "other"
  }

  fun chosenRoute(routes: List<AudioRoute>): AudioRoute =
    routes.minByOrNull { ROUTE_ORDER.indexOf(it.kind) } ?: AudioRoute("speaker", null)

  fun mediaSection(nowPlaying: NowPlaying?, live: Boolean): Any {
    val playing = nowPlaying?.playing ?: return JSONObject.NULL
    return JSONObject()
      .put("title", nowPlaying.track.ifEmpty { JSONObject.NULL })
      .put("artist", nowPlaying.artist.ifEmpty { JSONObject.NULL })
      .put("app", nowPlaying.packageName ?: JSONObject.NULL)
      .put("appLabel", nowPlaying.app ?: JSONObject.NULL)
      .put("state", if (playing) "playing" else "paused")
      .put("positionMs", if (live) nowPlaying.positionSeconds * MILLIS else JSONObject.NULL)
      .put("durationMs", if (nowPlaying.durationSeconds > 0) nowPlaying.durationSeconds * MILLIS else JSONObject.NULL)
  }

  override fun values(context: Context, request: PhoneReadRequest): Map<String, Any?> {
    val audio = context.getSystemService(AudioManager::class.java)
    return buildMap {
      put("ring_volume", PhoneReadings.percentOf(audio, AudioManager.STREAM_RING))
      put("alarm_volume", PhoneReadings.percentOf(audio, AudioManager.STREAM_ALARM))
      put("notification_volume", PhoneReadings.percentOf(audio, AudioManager.STREAM_NOTIFICATION))
      put("audio_output", route(context).kind)
      if (PhoneFeatures.phoneStateAllowed(context)) put("in_call", inCall(context))
    }
  }

  override fun section(context: Context, section: PhoneSection, request: PhoneReadRequest): JSONObject {
    val audio = context.getSystemService(AudioManager::class.java)
    val route = route(context)
    return body(streams(audio), route, mediaSection(WatchNotificationListener.active?.nowPlaying(), request.live))
  }

  fun body(streams: JSONObject, route: AudioRoute, media: Any): JSONObject = JSONObject()
    .put("streams", streams)
    .put("output", JSONObject().put("kind", route.kind).put("name", route.name ?: JSONObject.NULL))
    .put("media", media)

  fun streamsBody(media: Int, ring: Int, alarm: Int, notification: Int, call: Int): JSONObject = JSONObject()
    .put("media", media)
    .put("ring", ring)
    .put("alarm", alarm)
    .put("notification", notification)
    .put("call", call)

  override fun startLive(context: Context) {
    val changed = { PhoneReporter.report(context) }
    val observer = object : ContentObserver(handler) {
      override fun onChange(selfChange: Boolean) = changed()
    }
    context.contentResolver.registerContentObserver(Settings.System.CONTENT_URI, true, observer)
    volumes = observer
    val callback = object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) = changed()

      override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) = changed()
    }
    context.getSystemService(AudioManager::class.java).registerAudioDeviceCallback(callback, handler)
    devices = callback
  }

  override fun stopLive(context: Context) {
    volumes?.let { context.contentResolver.unregisterContentObserver(it) }
    devices?.let { context.getSystemService(AudioManager::class.java).unregisterAudioDeviceCallback(it) }
    volumes = null
    devices = null
  }

  private fun streams(audio: AudioManager): JSONObject = streamsBody(
    PhoneReadings.percentOf(audio, AudioManager.STREAM_MUSIC),
    PhoneReadings.percentOf(audio, AudioManager.STREAM_RING),
    PhoneReadings.percentOf(audio, AudioManager.STREAM_ALARM),
    PhoneReadings.percentOf(audio, AudioManager.STREAM_NOTIFICATION),
    PhoneReadings.percentOf(audio, AudioManager.STREAM_VOICE_CALL)
  )

  private fun route(context: Context): AudioRoute {
    val car = PhoneStore(context).car()
    val outputs = context.getSystemService(AudioManager::class.java).getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    return chosenRoute(
      outputs.filter { it.type != AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }.map {
        val kind = routeKind(it.type, it.address, car)
        AudioRoute(kind, if (kind == "speaker") null else it.productName?.toString()?.takeIf(String::isNotBlank))
      }
    )
  }

  private fun inCall(context: Context): Boolean =
    context.getSystemService(TelephonyManager::class.java).callState != TelephonyManager.CALL_STATE_IDLE
}
