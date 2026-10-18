import { ApiError } from '@smarteverything/domain';
import type { AiModelRoute, HarnessRuntimeRequest } from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';
import type { RemoteHarness } from './harness-remote';
import { confirmedPermissionRequest } from '../harness/permission';

function requestSession(request: HarnessRuntimeRequest): { id: string; epoch: number | null } {
  return request.kind === 'open'
    ? { id: request.claim.session_id, epoch: request.claim.epoch }
    : { id: request.session_id, epoch: request.expected_epoch };
}

export function admitComputerRequest(
  service: HarnessService,
  binding: RemoteHarness['binding'],
  request: HarnessRuntimeRequest,
): AiModelRoute | undefined {
  const { id, epoch } = requestSession(request);
  const grant = service.storage.grant(id);
  const state = service.store.harnessCoordination.state(id);
  if (state?.epoch !== epoch)
    throw new ApiError(
      'conflict',
      'This chat moved to another machine while the request was in flight; try again.',
    );
  service.storage.principal(id, binding);
  if (request.kind === 'permission') confirmedPermissionRequest(service, request);
  if (request.kind !== 'open') return undefined;
  return admitConsumerRoute(
    service,
    binding,
    service.routes.selected(grant.profile_id, grant.route, grant.authority.kind === 'trigger'),
  );
}
function admitConsumerRoute(
  service: HarnessService,
  binding: RemoteHarness['binding'],
  route: AiModelRoute,
): AiModelRoute {
  service.directory.bound(binding.device_id, binding.generation, binding.runtime_instance);
  return route;
}
