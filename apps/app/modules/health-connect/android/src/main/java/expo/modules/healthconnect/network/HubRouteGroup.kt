package expo.modules.healthconnect.network

internal class HubRouteGroup(val canonical: String, var trust: HubTrust, remembered: HubRouteEndpoint? = null) {
  private data class Announcement(
    val generation: Long,
    val network: Long,
    val readiness: HubRouteReadiness,
    val detail: String,
    val endpoint: HubRouteEndpoint?,
  )

  var generation = 0L
  var probe = 0L
  var endpoint: HubRouteEndpoint? = remembered
    private set
  var detail = if (remembered == null) "Verifying saved hub routes" else ""
    private set
  var pending = remembered == null
    private set
  private var announced: Announcement? = null

  fun readiness(): HubRouteReadiness = when {
    pending -> HubRouteReadiness.PENDING
    endpoint == null -> HubRouteReadiness.UNAVAILABLE
    else -> HubRouteReadiness.READY
  }

  fun settle(selected: HubRouteEndpoint?, nextGeneration: () -> Long) {
    if (selected != null && selected != endpoint) generation = nextGeneration()
    endpoint = selected ?: endpoint
    pending = false
    detail = if (endpoint == null) "No independently trusted hub identity answered" else ""
  }

  fun announce(network: Long): Boolean {
    val now = Announcement(generation, network, readiness(), detail, endpoint)
    if (now == announced) return false
    announced = now
    return true
  }
}
