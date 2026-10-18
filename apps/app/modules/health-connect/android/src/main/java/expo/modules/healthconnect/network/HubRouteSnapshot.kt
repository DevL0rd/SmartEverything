package expo.modules.healthconnect.network

import java.io.IOException

enum class HubRouteReadiness(val wire: String) {
  PENDING("pending"),
  READY("ready"),
  UNAVAILABLE("unavailable"),
}

data class HubRouteSnapshot(
  val scopeId: String,
  val canonicalOrigin: String,
  val hubId: String,
  val routeGeneration: Long,
  val networkGeneration: Long,
  val readiness: HubRouteReadiness,
  val detail: String,
  val endpoint: HubRouteEndpoint?,
) {
  fun toMap(): Map<String, Any?> = buildMap {
    put("scopeId", scopeId)
    put("canonicalOrigin", canonicalOrigin)
    put("hubId", hubId)
    put("routeGeneration", routeGeneration)
    put("networkGeneration", networkGeneration)
    put("readiness", readiness.wire)
    put("detail", detail)
    if (readiness == HubRouteReadiness.READY && endpoint != null) put("endpoint", endpoint.snapshot())
  }
}

class HubRouteUnavailable(detail: String) : IOException(detail)
