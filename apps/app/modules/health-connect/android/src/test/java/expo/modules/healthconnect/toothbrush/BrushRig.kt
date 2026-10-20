package expo.modules.healthconnect.toothbrush

import java.util.UUID

class ImmediateLoop : BrushLoop {
  override fun post(block: () -> Unit) = block()

  override fun clear() = Unit
}

class FakeRadio : BrushRadio {
  val log = mutableListOf<String>()
  val present = mutableSetOf<String>()
  var accepting = true
  var refreshWorks = true
  var enabled = true
  var bondedNow = true
  var discoveries = 0
  var refreshes = 0
  var closed = false

  override fun available() = enabled

  override fun bonded(address: String) = bondedNow

  override fun connect(address: String, autoConnect: Boolean) {
    log += "connect $address $autoConnect"
  }

  override fun reconnect() {
    log += "reconnect"
  }

  override fun discover() {
    discoveries += 1
  }

  override fun refresh(): Boolean {
    refreshes += 1
    return refreshWorks
  }

  override fun readRssi() = Unit

  override fun has(service: String, characteristic: String) = characteristic in present

  override fun subscribe(subscription: Subscription): Boolean {
    log += "subscribe ${subscription.characteristic}"
    return accepting
  }

  override fun read(service: String, characteristic: String): Boolean {
    log += "read $characteristic"
    return accepting
  }

  override fun write(service: String, characteristic: String, bytes: ByteArray, withoutResponse: Boolean): Boolean {
    log += "write $characteristic"
    return accepting
  }

  override fun close() {
    closed = true
  }
}

class RecordingListener : BrushListener {
  val phases = mutableListOf<String>()
  val notes = mutableListOf<String>()
  var ended = 0

  override fun phase(phase: String, detail: String?) {
    phases += phase
  }

  override fun notified(characteristic: String, value: ByteArray) {
    notes += characteristic
  }

  override fun ended() {
    ended += 1
  }
}

object Rig {
  const val SERVICE = "a0f0ff00-5047-4d53-8208-4f72616c2d42"

  fun uuid(key: String): String = "a0f0$key-5047-4d53-8208-4f72616c2d42"

  fun plan(
    subscriptions: List<String> = emptyList(),
    reads: List<String> = emptyList(),
    sync: List<String> = emptyList(),
    brand: String = "oralb",
    deviceId: String = "33333333-3333-4333-8333-333333333333"
  ) = LinkPlan(
    deviceId = deviceId,
    address = "A4:C1:38:00:00:01",
    transport = "gatt",
    brand = brand,
    bonded = false,
    adverts = AdvertFilter(220),
    prepare = emptyList(),
    subscriptions = subscriptions.map { Subscription(SERVICE, uuid(it), "notify") },
    reads = reads.map { ReadPlace(SERVICE, uuid(it)) },
    sync = sync.map { ReadPlace(SERVICE, uuid(it)) },
    initial = emptyList(),
    policy = "on_demand",
    holder = true
  )

  fun uuidOf(key: String): UUID = UUID.fromString(uuid(key))
}
