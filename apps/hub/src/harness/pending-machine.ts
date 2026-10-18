import { randomUUID } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import { moveConversation } from './machine-move';
import type { MoveOutcome } from './machine-move';
import type { HarnessService } from './service';

export async function noteMachineChange(
  service: HarnessService,
  chatId: string,
  text: string,
): Promise<void> {
  const chat = service.store.aiChats.chat(chatId);
  const session = service.state({ profileId: chat.profile_id, role: 'owner' }, chatId);
  if (session.epoch === null)
    throw new ApiError('conflict', 'The moved chat has no open session to tell.');
  await service.directory.execute(session.target, randomUUID(), {
    kind: 'note',
    session_id: session.session_id,
    expected_epoch: session.epoch,
    text,
  });
  announceMachine(service, chatId);
}

export function announceMachine(service: HarnessService, chatId: string): void {
  const chat = service.store.aiChats.chat(chatId);
  const host = service.directory.registered(service.binding(chat).execution_target).host;
  service.machineChanged(chat, `Now on ${host.name}`);
}

export async function applyPendingMachine(
  service: HarnessService,
  chatId: string,
  interrupt: boolean,
): Promise<MoveOutcome | undefined> {
  const chat = service.store.aiChats.chat(chatId);
  const target = chat.pending_execution_target;
  if (target === null) return undefined;
  service.store.aiChats.setPendingTarget(chatId, null);
  const owner = { profileId: chat.profile_id, role: 'owner' } as const;
  const session = service.state(owner, chatId);
  return moveConversation(service, {
    owner,
    chat,
    session,
    grant: service.storage.grant(session.session_id),
    target,
    route: service.selection(chat),
    interrupt,
  });
}
