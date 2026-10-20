package expo.modules.healthconnect.treadmill

class StatusPoller(private val request: StatusRequest) {
  private var lastState: Int? = null
  private var settling = 0

  fun heard(value: ByteArray) {
    if (request.stateByte < value.size) lastState = value[request.stateByte].toInt() and 0xff
  }

  fun commanded() {
    settling = request.settleRequests
  }

  fun due(elapsedMs: Long): Boolean {
    if (elapsedMs % request.everyMs != 0L) return false
    val state = lastState
    if (state != null && state in request.activeValues) return true
    if (settling == 0) return false
    settling -= 1
    return true
  }
}
