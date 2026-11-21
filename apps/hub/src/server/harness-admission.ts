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

export async function admitComputerRequest(
  service: HarnessService,
  binding: RemoteHarness['binding'],
  request: HarnessRuntimeRequest,
): Promise<AiModelRoute | undefined> {
  const { id, epoch } = requestSession(request);
  const grant = await service.storage.grant(id);
  const state = await service.store.host.call('harnessSessions', 'state', id);
  if (state?.epoch !== epoch)
    throw new ApiError(
      'conflict',
      'This chat moved to another machine while the request was in flight; try again.',
    );
  await service.storage.principal(id, binding);
  if (request.kind === 'permission') await confirmedPermissionRequest(service, request);
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
