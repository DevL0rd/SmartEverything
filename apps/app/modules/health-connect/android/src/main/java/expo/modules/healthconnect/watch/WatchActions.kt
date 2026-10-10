package expo.modules.healthconnect.watch

import android.os.Handler
import android.os.Looper
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class PhoneNotification(
  val id: Int,
  val packageName: String,
  val appName: String,
  val title: String,
  val body: String,
  val time: Instant,
  val canOpen: Boolean
)

class MusicState(
  val playing: Boolean?,
  val track: String,
  val artist: String,
  val positionSeconds: Int,
  val durationSeconds: Int,
  val volumePercent: Int
)

class WatchUser(
  val heightCm: Int,
  val weightKg: Double,
  val birthDate: String,
  val female: Boolean,
  val maxHeartRate: Int,
  val stepGoal: Int,
  val calorieGoal: Int,
  val activeMinutes: Int
)

sealed class WatchAction(val label: String) {
  class FindWatch(val on: Boolean) : WatchAction(if (on) "find watch" else "stop finding watch")
  class StopFindPhone : WatchAction("stop ringing on the watch")
  class Notify(val notification: PhoneNotification) : WatchAction("notification from ${notification.appName}")
  class Dismiss(val id: Int, val packageName: String) : WatchAction("dismiss notification")
  class IncomingCall(val name: String, val number: String) : WatchAction("incoming call")
  class CallEnded : WatchAction("call ended")
  class Music(val state: MusicState) : WatchAction("music state")
  class SetTime : WatchAction("set the time")
  class SetUser(val user: WatchUser) : WatchAction("send your details")
  class Weather(val weather: WatchWeather) : WatchAction("weather for ${weather.place}")
  class Calendar(val events: List<CalendarEntry>) : WatchAction("${events.size} calendar events")
}

sealed class WatchEvent(val label: String) {
  class FindPhone(val on: Boolean) : WatchEvent(if (on) "find phone" else "stop finding phone")
  class RejectCall : WatchEvent("reject call")
  class IgnoreCall : WatchEvent("mute call")
  class MediaKey(val key: Key) : WatchEvent("media ${key.name.lowercase()}") {
    enum class Key { PLAY, PAUSE, PREVIOUS, NEXT, VOLUME_UP, VOLUME_DOWN }
  }
  class MusicWanted : WatchEvent("music state wanted")
  class DismissNotification(val id: Int) : WatchEvent("notification dismissed on the watch")
  class OpenNotification(val id: Int) : WatchEvent("open notification on the phone")
}

private class ReadyWaiter(private val then: (Boolean) -> Unit) {
  private val done = AtomicBoolean(false)

  fun finish(ready: Boolean) {
    if (done.compareAndSet(false, true)) then(ready)
  }
}

object WatchActions {
  private val connections = ConcurrentHashMap<String, WatchConnection>()
  private val lock = Any()
  private val readyIds = mutableSetOf<String>()
  private val waiters = mutableMapOf<String, MutableList<ReadyWaiter>>()
  private val timeouts by lazy { Handler(Looper.getMainLooper()) }

  fun attach(deviceId: String, connection: WatchConnection) {
    connections[deviceId] = connection
  }

  fun detach(deviceId: String, connection: WatchConnection) {
    if (connections.remove(deviceId, connection)) {
      setReady(deviceId, false)
    }
  }

  fun setReady(deviceId: String, ready: Boolean) {
    val released = synchronized(lock) {
      if (ready) {
        readyIds.add(deviceId)
        waiters.remove(deviceId).orEmpty()
      } else {
        readyIds.remove(deviceId)
        emptyList()
      }
    }
    released.forEach { it.finish(true) }
  }

  fun whenReady(deviceId: String, timeoutMs: Long, then: (Boolean) -> Unit): () -> Unit {
    val waiter = ReadyWaiter(then)
    val ready = synchronized(lock) {
      val known = readyIds.contains(deviceId)
      if (!known) waiters.getOrPut(deviceId) { mutableListOf() }.add(waiter)
      known
    }
    if (ready) {
      waiter.finish(true)
      return {}
    }
    val expire = Runnable {
      synchronized(lock) { waiters[deviceId]?.remove(waiter) }
      waiter.finish(false)
    }
    timeouts.postDelayed(expire, timeoutMs)
    return {
      timeouts.removeCallbacks(expire)
      synchronized(lock) { waiters[deviceId]?.remove(waiter) }
    }
  }

  fun connected(): Boolean = connections.isNotEmpty()

  fun send(action: WatchAction): Int = connections.values.count { it.act(action) }

  fun sendTo(deviceId: String, action: WatchAction): Boolean = connections[deviceId]?.act(action) ?: false

  fun perform(deviceId: String, request: WatchRequest, reply: (ActionOutcome) -> Unit) {
    val connection = connections[deviceId]
    if (connection == null) {
      reply(ActionOutcome(false, "The watch is not connected to this phone right now."))
      return
    }
    connection.perform(request, reply)
  }
}
