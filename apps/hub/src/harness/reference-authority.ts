import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type { AiHarnessSession } from '@smarteverything/domain';
import type { ReferenceContext } from '../references/contracts';
import type { HarnessService } from './service';
import { executionRole } from '../assistant/execution-authority';
import { storedProjectBinding } from './project-grant';

export function nativeReferenceSession(
  service: HarnessService,
  context: ReferenceContext,
): AiHarnessSession {
  context.validate();
  const caller = context.caller;
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError('forbidden', 'Native references require their authenticated actor.');
  const role =
    caller.kind === 'client'
      ? service.store.clients.byId(caller.client.id).role
      : executionRole(service.store, caller.authority);
  const owner = { profileId: context.authority.profileId, role };
  const chat = service.store.aiChats.chat(context.chat.id);
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null)
    throw new ApiError('conflict', 'This conversation has no opened native reference registry.');
  const state = service.state(owner, chat.id);
  const connection = service.directory.get(state.target);
  service.admitTarget(
    owner,
    connection.host,
    connection.actor.id,
    caller.kind === 'client' ? caller.client.id : undefined,
  );
  if (connection.host.manifest?.references?.protocol !== 1)
    throw new ApiError(
      'conflict',
      'The selected execution host does not support structured references.',
    );
  if (state.epoch === null || state.state === 'switching')
    throw new ApiError(
      'conflict',
      'References require the current stable native session and epoch.',
    );
  if (service.store.harnessCoordination.permissionChange(state.session_id) !== null)
    throw new ApiError('conflict', 'The native policy change is pending confirmation.');
  verifyNativeReferenceWriter(service, state, owner.profileId);
  return state;
}
export function nativeReferenceRevision(
  service: HarnessService,
  context: ReferenceContext,
): string {
  context.validate();
  const chat = service.store.aiChats.chat(context.chat.id);
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null)
    return 'native-reference-registry-unopened';
  const session = service.store.harnessCoordination.state(chat.engine.session_id);
  const connection = service.directory
    .list()
    .find(
      (host) =>
        harnessTargetKey(host.target) ===
        harnessTargetKey(
          chat.engine.kind === 'dsh' ? chat.engine.execution_target : { kind: 'server' },
        ),
    );
  return JSON.stringify({
    session,
    connection,
    binding: storedProjectBinding(service.store, chat.engine.session_id),
    configuration: service.store.harnessConfiguration.currentRevision(),
  });
}

function verifyNativeReferenceWriter(
  service: HarnessService,
  state: AiHarnessSession,
  profileId: string,
): void {
  const grant = service.storage.grant(state.session_id);
  const host = service.directory.get(state.target).host;
  if (
    grant.generation !== host.connection_generation ||
    grant.runtime_instance !== host.runtime_instance ||
    harnessTargetKey(grant.target) !== harnessTargetKey(host.target)
  )
    throw new ApiError('forbidden', 'Reference authority belongs to another host generation.');
  const writer = service.store.dshSessions.writerState(state.session_id, profileId);
  if (writer.claim?.epoch !== state.epoch || writer.claim === null)
    throw new ApiError('conflict', 'References have no current owned native writer.');
  service.store.dshSessions.verifyWriter(writer.claim, service.hostPrincipal(profileId, host));
}
