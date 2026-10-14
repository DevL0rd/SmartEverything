import { ApiError, type AiChatRow, type DshEngine } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import { currentControlCaller } from '../server/local-control-context';
import type { HarnessService } from './service';
import { admitLegacyImport } from './legacy-history';

export function admitUnboundEngineChange(
  service: HarnessService,
  owner: ChatOwner,
  before: AiChatRow,
  engine: DshEngine,
): void {
  if (before.engine.kind === 'dsh' && before.engine.session_id !== null) return;
  if (engine.session_id !== null)
    throw new ApiError('forbidden', 'An unopened chat cannot acquire an existing native session.');
  if (service.store.assistantEvents.hasUnsettledChatWork(before.id))
    throw new ApiError('conflict', 'Settle active or unconfirmed work before selecting a host.');
  if (service.store.harnessRecovery.nativeAdmission(before.id) !== undefined)
    throw new ApiError(
      'conflict',
      'The prior native opening must be confirmed before changing hosts.',
    );
  const chat = { ...before, engine };
  const connection = service.directory.get(engine.execution_target);
  admitHostPrincipal(service, owner, connection);
  admitHostConfiguration(connection.host, engine);
  service.routes.selected(owner.profileId, service.selection(chat), false);
  admitLegacyImport(service, chat);
}

function initiatingClient(): string | undefined {
  const caller = currentControlCaller();
  return caller?.kind === 'client' && caller.via === undefined && caller.pluginId === undefined
    ? caller.client.id
    : undefined;
}
function admitHostPrincipal(
  service: HarnessService,
  owner: ChatOwner,
  connection: ReturnType<HarnessService['directory']['get']>,
): void {
  const clientId = initiatingClient();
  service.admitTarget(owner, connection.host, connection.actor.id, clientId);
  if (connection.profileId !== undefined && connection.profileId !== owner.profileId)
    throw new ApiError('forbidden', 'The selected host belongs to a different profile.');
}

function admitHostConfiguration(
  host: ReturnType<HarnessService['directory']['get']>['host'],
  engine: DshEngine,
): void {
  if (
    host.manifest === null ||
    host.workspace?.available !== true ||
    host.unavailable_reason !== null
  )
    throw new ApiError('conflict', 'The selected execution host is not ready.');
  if (
    !host.manifest.permissions.some(
      (policy) =>
        policy.sandbox === engine.permission.sandbox &&
        policy.approval === engine.permission.approval,
    )
  )
    throw new ApiError('conflict', 'The selected host cannot preserve this chat’s permissions.');
}
