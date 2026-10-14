import { setTimeout } from 'node:timers/promises';
import { ApiError, harnessTargetKey } from '@smarteverything/domain';
import type { AiHarnessSession, AiHarnessHost, DshWriterClaim } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';
import { openConversation } from './opening';

const MAX_LEASE_WAIT_MS = 125_000;
const refreshing = new WeakMap<HarnessService, Map<string, Promise<AiHarnessSession>>>();
interface SessionContext {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly clientId: string;
}
export async function stableHumanSession(
  service: HarnessService,
  context: SessionContext,
  expectedEpoch: number,
): Promise<AiHarnessSession> {
  const session = service.state(context.owner, context.chatId);
  if (session.epoch !== expectedEpoch || session.state === 'switching')
    throw new ApiError('conflict', 'Human recovery requires the exact stable session epoch.');
  const connection = service.directory.get(session.target);
  service.admitTarget(context.owner, connection.host, connection.actor.id, context.clientId);
  if (currentSession(service, context, session, connection.host)) return session;
  const active = refreshing.get(service) ?? new Map<string, Promise<AiHarnessSession>>();
  refreshing.set(service, active);
  const previous = active.get(session.session_id);
  if (previous !== undefined) return previous;
  const result = refreshSession(service, context, session).finally(() => {
    active.delete(session.session_id);
  });
  active.set(session.session_id, result);
  return result;
}
function bound(host: AiHarnessHost, claim: DshWriterClaim): boolean {
  return (
    host.runtime_instance === claim.runtime_instance &&
    host.connection_generation === claim.connection_generation &&
    harnessTargetKey(host.target) === harnessTargetKey(claim.target)
  );
}
function currentSession(
  service: HarnessService,
  context: SessionContext,
  session: AiHarnessSession,
  host: AiHarnessHost,
): boolean {
  const writer = service.store.dshSessions.writerState(session.session_id, context.owner.profileId);
  const grant = service.storage.grant(session.session_id);
  if (writer.state !== 'active' || writer.claim === null || !bound(host, writer.claim))
    return false;
  if (Date.parse(writer.claim.expires_at) <= Date.now()) return false;
  if (
    grant.runtime_instance !== host.runtime_instance ||
    grant.generation !== host.connection_generation
  )
    return false;
  if (writer.claim.epoch !== session.epoch) return false;
  service.store.dshSessions.verifyWriter(
    writer.claim,
    service.hostPrincipal(context.owner.profileId, host),
  );
  return (
    service.directory.get(session.target).hasSession?.(session.session_id, writer.claim.epoch) ===
    true
  );
}
async function refreshSession(
  service: HarnessService,
  context: SessionContext,
  original: AiHarnessSession,
): Promise<AiHarnessSession> {
  const writer = service.store.dshSessions.writerState(
    original.session_id,
    context.owner.profileId,
  );
  if (writer.state === 'active' && writer.claim !== null) {
    const delay = Math.max(0, Date.parse(writer.claim.expires_at) - Date.now());
    if (delay > MAX_LEASE_WAIT_MS)
      throw new ApiError('conflict', 'The existing writer lease exceeds the safe recovery window.');
    await setTimeout(delay);
  }
  const session = service.state(context.owner, context.chatId);
  if (
    session.session_id !== original.session_id ||
    harnessTargetKey(session.target) !== harnessTargetKey(original.target)
  )
    throw new ApiError('conflict', 'The conversation changed hosts during native recovery.');
  const connection = service.directory.get(session.target);
  service.admitTarget(context.owner, connection.host, connection.actor.id, context.clientId);
  if (currentSession(service, context, session, connection.host)) return session;
  if (session.epoch !== original.epoch || session.state === 'switching')
    throw new ApiError('conflict', 'The conversation writer changed during native recovery.');
  await openConversation(service, {
    ...context,
    authority: { kind: 'manual', profileId: context.owner.profileId },
  });
  return service.state(context.owner, context.chatId);
}

export function staleHumanSession(service: HarnessService, session: AiHarnessSession): boolean {
  const host = service.directory
    .list()
    .find((entry) => harnessTargetKey(entry.target) === harnessTargetKey(session.target));
  if (host === undefined || !host.online || session.state === 'switching') return false;
  const grant = service.storage.grant(session.session_id);
  return (
    grant.runtime_instance !== host.runtime_instance ||
    grant.generation !== host.connection_generation
  );
}
