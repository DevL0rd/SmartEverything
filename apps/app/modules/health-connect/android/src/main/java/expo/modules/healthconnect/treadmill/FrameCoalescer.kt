package expo.modules.healthconnect.treadmill

import java.time.Instant

class FrameCoalescer(private val deliveries: List<LinkDelivery>, private val now: () -> Instant) {
  private val latest = LinkedHashMap<String, TreadmillFrame>()
  private val stateBytes = HashMap<String, Int>()

  fun accept(characteristic: String, bytes: ByteArray): TreadmillFrame? {
    val delivery = deliveries.firstOrNull { it.characteristic == characteristic } ?: return null
    val frame = TreadmillFrame(now().toString(), characteristic, TreadmillHex.of(bytes))
    val prefix = delivery.coalescePrefix ?: return frame
    if (!frame.hex.startsWith(prefix)) return frame
    val index = delivery.changeByte
    if (index != null && index < bytes.size) {
      val value = bytes[index].toInt() and 0xff
      val previous = stateBytes.put(characteristic, value)
      if (previous != null && previous != value) {
        latest.remove(characteristic)
        return frame
      }
    }
    latest[characteristic] = frame
    return null
  }

  fun drain(): List<TreadmillFrame> {
    val frames = latest.values.toList()
    latest.clear()
    return frames
  }

  fun pending(): Boolean = latest.isNotEmpty()
}
