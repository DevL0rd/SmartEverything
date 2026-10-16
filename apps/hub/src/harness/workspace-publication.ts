import { issueProjectGrant } from './project-grant';
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
  validateStorage(event, grant);
  const previous = service.store.dshSessions.workspace(
    event.session_id,
    grant.target,
    grant.profile_id,
  );
  if (
    previous?.cwd === directory.path &&
    JSON.stringify(grant.storage_binding) === JSON.stringify(event.session.storage_binding)
  )
    return;
  if (harnessTargetKey(directory.target) !== harnessTargetKey(grant.target))
    throw new ApiError('forbidden', 'Native workspace publication belongs to another host.');
  const writer = service.store.dshSessions.writerState(event.session_id, grant.profile_id);
  if (writer.claim === null)
    throw new ApiError('conflict', 'Native workspace has no current writer.');
  service.store.dshSessions.saveWorkspace(
    { claim: writer.claim, cwd: directory.path },
    service.hostPrincipal(grant.profile_id, service.directory.get(grant.target).host),
  );
  const storage_binding = event.session.storage_binding;
  issueProjectGrant(service.store, {
    ...grant,
    cwd: directory.path,
    ...(storage_binding === undefined ? {} : { storage_binding }),
  });
}
function validateStorage(
  event: Extract<AiHarnessEvent, { kind: 'state' }>,
  grant: HarnessGrant,
): void {
  const binding = event.session.storage_binding;
  validateDeviceBinding(event, grant);
  if (grant.storage_binding?.kind === 'managed' && binding === undefined)
    throw new ApiError(
      'forbidden',
      'Central project storage binding cannot be dropped by workspace publication.',
    );
  if (binding?.kind === 'managed' && binding.chat_id !== event.session.chat_id)
    throw new ApiError('forbidden', 'Central project binding belongs to another chat.');
}

function validateDeviceBinding(
  event: Extract<AiHarnessEvent, { kind: 'state' }>,
  grant: HarnessGrant,
): void {
  const binding = event.session.storage_binding;
  if (binding?.kind !== 'device') return;
  if (harnessTargetKey(binding.target) !== harnessTargetKey(grant.target))
    throw new ApiError(
      'forbidden',
      'Explicit project binding differs from its execution directory.',
    );
}
