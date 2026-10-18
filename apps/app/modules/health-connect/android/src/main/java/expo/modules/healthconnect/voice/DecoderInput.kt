package expo.modules.healthconnect.voice

class DecoderInput(private val queue: (index: Int, packet: ByteArray, presentationUs: Long) -> Unit) {
  private val packets = ArrayDeque<ByteArray>()
  private val free = ArrayDeque<Int>()
  private var presentationUs = 0L

  fun offer(packet: ByteArray) {
    packets.addLast(packet)
    pump()
  }

  fun available(index: Int) {
    free.addLast(index)
    pump()
  }

  fun reset() {
    packets.clear()
    free.clear()
  }

  private fun pump() {
    while (packets.isNotEmpty() && free.isNotEmpty()) {
      queue(free.removeFirst(), packets.removeFirst(), presentationUs)
      presentationUs += FRAME_US
    }
  }

  private companion object {
    const val FRAME_US = 20_000L
  }
}
