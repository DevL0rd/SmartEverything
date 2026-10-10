package expo.modules.healthconnect.watch.xiaomi

import expo.modules.healthconnect.fromHex
import expo.modules.healthconnect.watch.ActionOutcome
import expo.modules.healthconnect.watch.WatchAction
import expo.modules.healthconnect.watch.WatchRequest
import expo.modules.healthconnect.watch.WatchUserStore
import expo.modules.healthconnect.watch.WatchWeather
import expo.modules.healthconnect.watch.WatchCalendar
import expo.modules.healthconnect.watch.WatchContext
import expo.modules.healthconnect.watch.WatchPhase
import java.security.MessageDigest
import java.security.SecureRandom

class XiaomiSession(
  private val watch: WatchContext,
  private val cipher: XiaomiCipher,
  private val phoneId: String?,
  private val send: (XiaomiChannel, ByteArray) -> Unit
) : XiaomiSppSink {
  private val sink = watch.sink
  private var phoneNonce = ByteArray(NONCE_BYTES)
  private val ignoredKinds = mutableSetOf<Pair<Int, Int>>()
  var authenticated = false
    private set
  var live = false
  private val workouts: XiaomiWorkouts = XiaomiWorkouts(
    XiaomiWorkoutHooks(
      send = { send(XiaomiChannel.COMMAND, it) },
      note = { event, detail -> sink.note(event, detail) },
      changed = { sink.workout(it) },
      sportsRead = { config.publish() },
      finished = { sync("workout finished") }
    ),
    XiaomiSports.declared(watch.watch.model, watch.watch.name)
  )
  private val config: XiaomiConfig = XiaomiConfig(
    { send(XiaomiChannel.COMMAND, it) },
    XiaomiGoals { event, detail -> sink.note(event, detail) },
    { workouts.sports() }
  ) { sink.config(it) }
  private val sync = XiaomiSync(watch.sink, watch.handler, watch.skippedFiles) { send(XiaomiChannel.COMMAND, it) }

  private val authTimeout = Runnable {
    sink.failed("The watch did not finish signing in within ${AUTH_TIMEOUT_MS / 1000} s", true)
  }

  override fun ready(version: Int) {
    sink.phase(WatchPhase.AUTHENTICATING, "Signing in to the watch (protocol version $version)")
    SecureRandom().nextBytes(phoneNonce)
    send(XiaomiChannel.AUTHENTICATION, XiaomiCommands.nonce(phoneNonce, phoneId))
    watch.handler.postDelayed(authTimeout, AUTH_TIMEOUT_MS)
  }

  override fun packet(channel: XiaomiChannel, payload: ByteArray) {
    if (channel == XiaomiChannel.ACTIVITY) {
      sync.chunk(payload)
      return
    }
    if (channel != XiaomiChannel.COMMAND) {
      sink.note("packet_ignored", "${payload.size} bytes on the ${channel.name.lowercase()} channel")
      return
    }
    val command = XiaomiCommand.parse(payload)
    if (config.handle(command)) {
      return
    }
    when (command.type) {
      XiaomiCommands.TYPE_AUTH -> auth(command)
      XiaomiCommands.TYPE_SYSTEM -> system(command)
      XiaomiCommands.TYPE_HEALTH -> health(command)
      WEATHER_TYPE -> weatherRequest(command)
      else -> XiaomiActions.event(command)?.let { sink.event(it) } ?: ignored(command)
    }
  }

  override fun note(event: String, detail: String) = sink.note(event, detail)

  override fun linkFailed(reason: String) = sink.failed(reason, true)

  fun dispose() {
    watch.handler.removeCallbacks(authTimeout)
    sync.stop()
    authenticated = false
  }

  fun act(action: WatchAction): Boolean {
    if (!authenticated) {
      sink.note("action_waiting", "${action.label}: not signed in to the watch yet")
      return false
    }
    if (action is WatchAction.Weather) {
      return sendWeather(action.weather)
    }
    send(XiaomiChannel.COMMAND, XiaomiActions.encode(action, watch.context))
    sink.note("action_sent", action.label)
    if (action is WatchAction.SetUser) {
      config.userSent(action.user)
    }
    return true
  }

  private fun sendWeather(weather: WatchWeather): Boolean = try {
    XiaomiWeather.commands(weather).forEach { send(XiaomiChannel.COMMAND, it) }
    sink.note("weather_sent", "${weather.place}: ${weather.days.size} days, ${weather.hours.size} hours")
    true
  } catch (unmapped: UnmappedWeather) {
    sink.note("weather_not_sent", unmapped.message.orEmpty())
    false
  }

  fun perform(request: WatchRequest): ActionOutcome {
    if (!authenticated) {
      return ActionOutcome(false, "The watch is not signed in yet; try again when it shows Connected.")
    }
    sink.note("request", request.label)
    return when (request) {
      is WatchRequest.SetSetting -> config.setting(request.key, request.raw)
      is WatchRequest.SaveAlarm -> config.saveAlarm(request.alarm)
      is WatchRequest.DeleteAlarm -> config.deleteAlarm(request.id)
      is WatchRequest.SetFace -> config.setFace(request.id)
      is WatchRequest.DeleteFace -> config.deleteFace(request.id)
      is WatchRequest.ProbeWorkout -> workouts.probe(request.sport, request.on)
      is WatchRequest.StartWorkout -> workouts.start(request.sport)
      is WatchRequest.ChangeWorkout -> workouts.change(request.change)
    }
  }

  fun sync(reason: String) {
    if (authenticated) {
      sync.start(reason)
    } else {
      sink.note("sync_waiting", "not signed in to the watch yet ($reason)")
    }
  }

  fun refresh() {
    if (!authenticated) {
      return
    }
    config.requestAll()
    request(XiaomiCommands.TYPE_SYSTEM, XiaomiCommands.SYSTEM_DEVICE_STATE_GET)
    request(XiaomiCommands.TYPE_SYSTEM, XiaomiCommands.SYSTEM_BATTERY)
  }

  fun applyLive(on: Boolean) {
    live = on
    if (authenticated) {
      val subtype = if (on) XiaomiCommands.HEALTH_REALTIME_START else XiaomiCommands.HEALTH_REALTIME_STOP
      request(XiaomiCommands.TYPE_HEALTH, subtype)
    }
  }

  private fun request(type: Int, subtype: Int) = send(XiaomiChannel.COMMAND, XiaomiCommands.simple(type, subtype))

  private fun auth(command: XiaomiCommand) {
    when (command.subtype) {
      XiaomiCommands.AUTH_NONCE -> answerNonce(command)
      XiaomiCommands.AUTH_CONFIRM -> signedIn()
      else -> {
        watch.handler.removeCallbacks(authTimeout)
        sink.failed("The watch refused to sign in (step ${command.subtype}, status ${command.status})", false)
      }
    }
  }

  private fun answerNonce(command: XiaomiCommand) {
    val (watchNonce, watchHmac) = XiaomiCommands.watchNonce(command) ?: run {
      sink.failed("The watch answered the sign-in without its nonce (status ${command.status})", false)
      return
    }
    val keys = XiaomiCrypto.sessionKeys(watch.watch.authKey.fromHex(), phoneNonce, watchNonce)
    val expected = XiaomiCrypto.hmac(keys.decryptionKey, watchNonce, phoneNonce)
    if (!MessageDigest.isEqual(expected, watchHmac)) {
      watch.handler.removeCallbacks(authTimeout)
      sink.failed("The watch rejected the key from your Mi Fitness account; re-add the watch", false)
      return
    }
    cipher.keys = keys
    val nonces = XiaomiCrypto.hmac(keys.encryptionKey, phoneNonce, watchNonce)
    send(XiaomiChannel.AUTHENTICATION, XiaomiCommands.confirm(nonces, cipher.encryptV1(XiaomiCommands.companionDevice(), 0)))
  }

  private fun signedIn() {
    watch.handler.removeCallbacks(authTimeout)
    authenticated = true
    sink.phase(WatchPhase.CONNECTED, "Signed in to ${watch.watch.name}")
    request(XiaomiCommands.TYPE_SYSTEM, XiaomiCommands.SYSTEM_DEVICE_INFO)
    request(XiaomiCommands.TYPE_SYSTEM, XiaomiWorkouts.SYSTEM_WORKOUT_TYPES_GET)
    act(WatchAction.SetTime())
    WatchUserStore.read(watch.context)?.let { act(WatchAction.SetUser(it)) }
    WatchWeather.latest(watch.context)?.let { sendWeather(it) }
    WatchCalendar.latest(watch.context)?.let { act(WatchAction.Calendar(it)) }
    refresh()
    if (live) {
      applyLive(true)
    }
  }

  private fun system(command: XiaomiCommand) {
    when (command.subtype) {
      XiaomiCommands.SYSTEM_BATTERY -> XiaomiCommands.battery(command)?.takeIf { it.level in 1..100 }?.let {
        sink.battery(it.level, it.charging)
      }
      XiaomiCommands.SYSTEM_DEVICE_INFO -> XiaomiCommands.deviceInfo(command)?.let { sink.device(it.firmware, it.model, it.serial) }
      XiaomiCommands.SYSTEM_DEVICE_STATE_GET -> XiaomiCommands.basicState(command)?.let { state(it) }
      XiaomiCommands.SYSTEM_DEVICE_STATE -> XiaomiCommands.pushedState(command)?.let { state(it) }
      XiaomiWorkouts.SYSTEM_WORKOUT_TYPES_GET -> workouts.types(command)
      else -> XiaomiActions.event(command)?.let { sink.event(it) }
        ?: if (XiaomiActions.isFindWatchEcho(command)) sink.note("find_watch", "the watch answered find watch") else ignored(command)
    }
  }

  private fun state(reading: DeviceStateReading) {
    sink.note("device_state", "worn=${reading.worn} charging=${reading.charging} battery=${reading.battery}")
    reading.worn?.let { sink.worn(it) }
    val level = reading.battery
    if (level != null && level in 1..100) {
      sink.battery(level, reading.charging)
    }
  }

  private fun health(command: XiaomiCommand) {
    when (command.subtype) {
      XiaomiCommands.HEALTH_REALTIME_EVENT -> XiaomiCommands.realtime(command)?.let { sink.live(it.steps, it.heartRate, it.calories) }
      XiaomiSync.FETCH_TODAY, XiaomiSync.FETCH_PAST ->
        sync.fileList(command.subtype, command.part(XiaomiCommand.HEALTH)?.bytes(2) ?: ByteArray(0))
      XiaomiSync.ACK, XiaomiSync.FETCH_FILE -> Unit
      else -> if (!workouts.handle(command)) ignored(command)
    }
  }

  private fun weatherRequest(command: XiaomiCommand) {
    if (command.subtype != XiaomiWeather.CONDITIONS_WANTED) {
      return
    }
    val latest = WatchWeather.latest(watch.context)
    if (latest == null) {
      sink.note("weather_not_sent", "the watch asked for weather, but none has reached this phone yet")
    } else {
      sendWeather(latest)
    }
  }

  private fun ignored(command: XiaomiCommand) {
    val key = command.type to command.subtype
    if (!ignoredKinds.add(key)) {
      return
    }
    val known = KNOWN_UNHANDLED[key]
    val what = known ?: "unknown to this app and to Gadgetbridge"
    sink.note("command_ignored", "type ${command.type} subtype ${command.subtype}: $what (fields ${command.body.fieldNumbers().sorted()})")
  }

  private companion object {
    const val WEATHER_TYPE = 10
    val KNOWN_UNHANDLED = mapOf(
      (17 to 7) to "a schedule (alarm/reminder) change pushed by the watch; Gadgetbridge ignores it too"
    )
    const val NONCE_BYTES = 16
    const val AUTH_TIMEOUT_MS = 15_000L
  }
}
