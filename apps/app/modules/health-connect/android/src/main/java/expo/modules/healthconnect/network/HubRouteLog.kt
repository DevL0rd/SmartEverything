package expo.modules.healthconnect.network

import expo.modules.healthconnect.diagnostics.NativeLog

internal object HubRouteLog {
  private const val SCOPE = "hub-route"

  fun applied(next: HubRouteConfiguration, old: HubRouteConfiguration?, retired: Set<String>, native: Boolean) =
    NativeLog.info(SCOPE, "configure.applied") {
      mapOf(
        "scope" to NativeLog.scopeLabel(next.trust.scopeId),
        "canonical" to NativeLog.hostOnly(next.canonical),
        "native" to native,
        "replaced" to (old != null),
        "bindingsChanged" to (old != null && old.bindings != next.bindings),
        "retired" to retired.map(NativeLog::scopeLabel),
        "endpoints" to next.trust.inventory.map { it.kind },
        "bindings" to next.bindings.map { "${it.credentialKind}#${it.credentialGeneration}" },
      )
    }

  fun installed(next: HubRouteConfiguration, group: HubRouteGroup, remembered: HubRouteEndpoint?, newGroup: Boolean) =
    NativeLog.debug(SCOPE, "scope.installed") {
      mapOf(
        "scope" to NativeLog.scopeLabel(next.trust.scopeId),
        "generation" to group.generation,
        "probe" to group.probe,
        "remembered" to remembered?.kind,
        "newGroup" to newGroup,
      )
    }

  fun probeFinished(scopeId: String, token: Long, candidates: Int, selected: HubRouteEndpoint?, started: Long) =
    NativeLog.info(SCOPE, "probe.finished", NativeLog.elapsedMs(started)) {
      mapOf(
        "scope" to NativeLog.scopeLabel(scopeId),
        "probeToken" to token,
        "candidates" to candidates,
        "selected" to selected?.kind,
        "selectedHost" to selected?.let { NativeLog.hostOnly(it.url) },
      )
    }

  fun settled(group: HubRouteGroup, network: Long, changed: Boolean, announced: Boolean, listeners: Int) =
    NativeLog.info(SCOPE, "route.settled") {
      mapOf(
        "canonical" to NativeLog.hostOnly(group.canonical),
        "generation" to group.generation,
        "network" to network,
        "readiness" to group.readiness().wire,
        "endpointKind" to group.endpoint?.kind,
        "endpointHost" to group.endpoint?.let { NativeLog.hostOnly(it.url) },
        "endpointChanged" to changed,
        "announced" to announced,
        "detail" to group.detail,
        "listeners" to listeners,
      )
    }

  fun notified(state: HubRouteSnapshot, listeners: Int) =
    NativeLog.debug(SCOPE, "route.notified") {
      mapOf(
        "scope" to NativeLog.scopeLabel(state.scopeId),
        "generation" to state.routeGeneration,
        "readiness" to state.readiness.wire,
        "listeners" to listeners,
      )
    }

  fun unavailable(scopeId: String, group: HubRouteGroup) =
    NativeLog.warn(SCOPE, "lease.unavailable") {
      mapOf(
        "scope" to NativeLog.scopeLabel(scopeId),
        "readiness" to group.readiness().wire,
        "generation" to group.generation,
        "detail" to group.detail,
      )
    }
}
