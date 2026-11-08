package expo.modules.healthconnect.connections

data class DeviceConnection(val name: String, val phase: String, val connected: Boolean)

internal class DeviceConnectionSummary(devices: List<DeviceConnection>) {
  private val connectedCount = devices.count { it.connected }
  val title: String = when (connectedCount) {
    0 -> "Device connections"
    1 -> "1 device connected"
    else -> "$connectedCount devices connected"
  }
  val text: String = devices
    .sortedWith(compareByDescending<DeviceConnection> { it.connected }.thenBy { it.name }.thenBy { it.phase })
    .joinToString(" · ") { "${it.name}: ${it.phase}" }
    .ifEmpty { "Waiting for devices" }
}

internal class DeviceConnectionNotices<Owner : Any>(
  private val now: () -> Long,
  private val scheduleAt: (Runnable, Long) -> Unit,
  private val cancel: (Runnable) -> Unit,
  private val show: (Owner, DeviceConnectionSummary) -> Boolean
) {
  private val devicesByOwner = mutableMapOf<Owner, List<DeviceConnection>>()
  private var nextPublicationAt = 0L
  private var publicationPending = false
  private val publication = Runnable { publishLatest() }

  fun start(owner: Owner) {
    if (!show(owner, summary())) return
    devicesByOwner[owner] = emptyList()
    postponeNextPublication()
    if (publicationPending) schedulePublication()
  }

  fun update(owner: Owner, devices: List<DeviceConnection>) {
    val current = devicesByOwner[owner] ?: return
    if (current == devices) return
    devicesByOwner[owner] = devices
    if (!publicationPending) schedulePublication()
  }

  fun stop(owner: Owner) {
    if (devicesByOwner.remove(owner) == null) return
    if (devicesByOwner.isEmpty()) {
      cancel(publication)
      publicationPending = false
      return
    }
    if (!publicationPending) schedulePublication()
  }

  private fun schedulePublication() {
    publicationPending = true
    scheduleAt(publication, maxOf(now(), nextPublicationAt))
  }

  private fun publishLatest() {
    publicationPending = false
    val owner = devicesByOwner.keys.firstOrNull() ?: return
    if (show(owner, summary())) postponeNextPublication()
  }

  private fun postponeNextPublication() {
    nextPublicationAt = now() + ANDROID_NOTIFICATION_UPDATE_WINDOW_MS
  }

  private fun summary(): DeviceConnectionSummary = DeviceConnectionSummary(devicesByOwner.values.flatten())

  private companion object {
    const val ANDROID_NOTIFICATION_UPDATE_WINDOW_MS = 1_000L
  }
}
