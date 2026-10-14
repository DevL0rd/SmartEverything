import {
  ApiError,
  harnessTargetKey,
  AI_MODEL_ROUTE_SELECTION_WRITE,
  AI_HARNESS_PERMISSION_WRITE,
} from '@smarteverything/domain';
import type {
  AiModelRoute,
  AiModelRouteSelection,
  AiHarnessPermission,
  HarnessRuntimeRequest,
} from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';
import type { RemoteHarness } from './harness-remote';
import { confirmedPermissionRequest } from '../harness/permission';
import type { HarnessGrant } from '../harness/grant';

export function admitComputerRequest(
  service: HarnessService,
  binding: RemoteHarness['binding'],
  request: HarnessRuntimeRequest,
): AiModelRoute | undefined {
  const id = request.kind === 'open' ? request.claim.session_id : request.session_id;
  const epoch = request.kind === 'open' ? request.claim.epoch : request.expected_epoch;
  const grant = service.storage.grant(id);
  const state = service.store.harnessCoordination.state(id);
  if (state?.epoch !== epoch)
    throw new ApiError('forbidden', 'Computer operation belongs to a stale writer epoch.');
  if (request.kind === 'preflight') {
    const handoff = state.handoff;
    if (
      handoff?.stage !== 'preflight' ||
      harnessTargetKey(handoff.target) !== `device:${binding.device_id}`
    )
      throw new ApiError('forbidden', 'Target preflight requires its admitted handoff.');
    return admitConsumerRoute(
      service,
      binding,
      service.routes.selected(grant.profile_id, request.route, grant.authority.kind === 'trigger'),
    );
  }
  service.storage.principal(id, binding);
  const route = admittedControl(service, grant, request);
  return route === undefined ? undefined : admitConsumerRoute(service, binding, route);
}
function admitOpening(
  grant: HarnessGrant,
  request: Extract<HarnessRuntimeRequest, { kind: 'open' }>,
): void {
  if (openingConfiguration(grant) !== openingConfiguration(request))
    throw new ApiError('forbidden', 'Computer opening differs from its initiating grant.');
}

function openingConfiguration(input: {
  readonly route: AiModelRouteSelection;
  readonly permission: AiHarnessPermission;
  readonly cwd: string;
}): string {
  return JSON.stringify({
    route: AI_MODEL_ROUTE_SELECTION_WRITE.parse(input.route),
    permission: AI_HARNESS_PERMISSION_WRITE.parse(input.permission),
    cwd: input.cwd,
  });
}

function admittedControl(
  service: HarnessService,
  grant: HarnessGrant,
  request: HarnessRuntimeRequest,
): AiModelRoute | undefined {
  if (request.kind === 'permission') confirmedPermissionRequest(service, request);
  if (request.kind !== 'open') return undefined;
  admitOpening(grant, request);
  return service.routes.selected(grant.profile_id, grant.route, grant.authority.kind === 'trigger');
}

function admitConsumerRoute(
  service: HarnessService,
  binding: RemoteHarness['binding'],
  route: AiModelRoute,
): AiModelRoute {
  service.directory.bound(binding.device_id, binding.generation, binding.runtime_instance);
  return route;
}
