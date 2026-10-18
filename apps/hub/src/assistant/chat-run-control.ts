import { ApiError } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ChatDirectory, ChatOwner } from './chat-directory';
import type { EngineRegistry } from './engines/registry';

const log = new Logger('hub.assistant');

export interface ChatRunControl {
  readonly chats: ChatDirectory;
  readonly engines: EngineRegistry;
}

export async function compactChat(
  { chats, engines }: ChatRunControl,
  owner: ChatOwner,
  chatId: string,
  clientId?: string,
): Promise<boolean> {
  const chat = chats.own(owner, chatId);
  const engine = engines.forMutation(chat, owner.role);
  if (engine?.status(chat).state === 'working') {
    log.warn('compact.refused', { chatId, profileId: owner.profileId, reason: 'working' });
    throw new ApiError('conflict', 'Wait for active work to finish before compacting.');
  }
  const startedAt = performance.now();
  log.info('compact.started', { chatId, profileId: owner.profileId, clientId });
  try {
    const compacted = (await engine?.compact(chat, clientId)) ?? false;
    log.info('compact.finished', {
      chatId,
      profileId: owner.profileId,
      compacted,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return compacted;
  } catch (cause) {
    log.error('compact.failed', cause, {
      chatId,
      profileId: owner.profileId,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw cause;
  }
}

export async function interruptChat(
  { chats, engines }: ChatRunControl,
  owner: ChatOwner,
  chatId: string,
): Promise<void> {
  const chat = chats.own(owner, chatId);
  const engine = engines.forMutation(chat, owner.role);
  if (engine === null) {
    log.debug('interrupt.nothing_running', { chatId, profileId: owner.profileId });
    throw new ApiError('conflict', 'Nothing is running in this chat.');
  }
  log.info('interrupt.requested', { chatId, profileId: owner.profileId });
  await engine.interrupt(chat);
  log.debug('interrupt.settled', { chatId, profileId: owner.profileId });
}
