package expo.modules.healthconnect.oralb

enum class OralbAttempt { CONNECT, SYNC }

class OralbPace(private val retryMs: Long = RETRY_MS) {
  private val last = HashMap<Pair<String, OralbAttempt>, Long>()

  @Synchronized
  fun allow(address: String, kind: OralbAttempt, now: Long): Boolean {
    val key = address.uppercase() to kind
    val previous = last[key]
    if (previous != null && now - previous < retryMs) return false
    last[key] = now
    return true
  }

  @Synchronized
  fun reset(address: String, kind: OralbAttempt) {
    last.remove(address.uppercase() to kind)
  }

  companion object {
    const val RETRY_MS = 30_000L
  }
}
