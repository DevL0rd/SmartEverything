package expo.modules.healthconnect.voice

interface TrackPort {
  fun playbackHead(): Long
  fun stop()
  fun release()
}

class SharedTrack<T : TrackPort>(val port: T) {
  private val lock = Any()
  private var closed = false

  fun head(): Long? = synchronized(lock) { if (closed) null else port.playbackHead() }

  fun close() = synchronized(lock) {
    if (!closed) {
      closed = true
      port.stop()
      port.release()
    }
  }
}
