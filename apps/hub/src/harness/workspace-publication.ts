import { ApiError, harnessTargetKey, type AiHarnessEvent } from '@smarteverything/domain';
import type { HarnessGrant } from './grant';
import type { HarnessService } from './service';
export function projectNativeWorkspace(
  service: HarnessService,
  event: Extract<AiHarnessEvent, { kind: 'state' }>,
  grant: HarnessGrant,
): void {
  const directory = event.session.directory;
  if (directory === null) return;
  const previous = service.store.dshSessions.workspace(
    event.session_id,
    grant.target,
    grant.profile_id,
  );
  if (previous?.cwd === directory.path) return;
  if (harnessTargetKey(directory.target) !== harnessTargetKey(grant.target))
    throw new ApiError('forbidden', 'Native workspace publication belongs to another host.');
  const claim = service.store.dshSessions.attached(event.session_id, grant.profile_id);
  if (claim === null) throw new ApiError('conflict', 'Native workspace has no current writer.');
  service.store.dshSessions.saveWorkspace(
    { claim, cwd: directory.path },
    service.hostPrincipal(grant.profile_id, service.directory.get(grant.target).host),
  );
  service.store.harnessCoordination.issue({ ...grant, cwd: directory.path });
}
