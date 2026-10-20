package expo.modules.healthconnect.oralb

import expo.modules.healthconnect.toothbrush.BrushAdvert

class OralbAdverts(private val clock: () -> Long, private val intervalMs: Long = INTERVAL_MS) {
  private val pending = HashMap<String, MutableList<BrushAdvert>>()
  private val sentAt = HashMap<String, Long>()

  @Synchronized
  fun add(deviceId: String, adverts: List<BrushAdvert>, closing: Boolean, send: (List<BrushAdvert>) -> Unit) {
    val queue = pending.getOrPut(deviceId) { ArrayList() }
    queue.addAll(adverts)
    val now = clock()
    val last = sentAt[deviceId]
    if (!closing && last != null && now - last < intervalMs) return
    sentAt[deviceId] = now
    val batch = queue.toList()
    queue.clear()
    send(batch)
  }

  companion object {
    const val INTERVAL_MS = 1_000L
  }
}
