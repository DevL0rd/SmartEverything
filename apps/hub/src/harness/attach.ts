import type { AiHarnessSession } from '@smarteverything/domain';
import { ApiError } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import { sameTarget } from './machine-move';
import { openConversation } from './opening';
import type { HarnessService } from './service';

export interface AttachContext {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly clientId: string;
}

export function sessionAttached(
  service: HarnessService,
  sessionId: string | null,
  profileId: string,
): boolean {
  if (sessionId === null) return false;
  const claim = service.store.dshSessions.attached(sessionId, profileId);
  if (claim === null) return false;
  if (!service.directory.holds(claim.target, sessionId, claim.epoch)) return false;
  const host = service.directory.registered(claim.target).host;
  return (
    host.runtime_instance === claim.runtime_instance &&
    host.connection_generation === claim.connection_generation
  );
}

export async function ensureAttached(
  service: HarnessService,
  context: AttachContext,
  expectedEpoch?: number,
): Promise<AiHarnessSession> {
  const { owner, chatId } = context;
  const chat = service.own(owner, chatId);
  const sessionId = service.binding(chat).session_id;
  if (sessionId !== null && expectedEpoch !== undefined) {
    const session = service.state(owner, chatId);
    if (session.epoch !== expectedEpoch || session.state === 'switching')
      throw new ApiError('conflict', 'This action needs the current stable session epoch.');
  }
  if (!sessionAttached(service, sessionId, chat.profile_id))
    await openConversation(service, {
      owner,
      chatId,
      authority: { kind: 'manual', profileId: owner.profileId },
      clientId: context.clientId,
    });
  return service.state(owner, chatId);
}

export async function readSession(
  service: HarnessService,
  context: AttachContext,
): Promise<AiHarnessSession> {
  const chat = service.own(context.owner, context.chatId);
  const binding = service.binding(chat);
  const host = service.directory
    .list()
    .find((entry) => sameTarget(entry.target, binding.execution_target));
  const switching =
    binding.session_id !== null &&
    service.state(context.owner, context.chatId).state === 'switching';
  if (host?.online !== true || switching) return service.state(context.owner, context.chatId);
  return ensureAttached(service, context);
}
