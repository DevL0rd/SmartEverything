import { catalogedHelpers, deliveredIds, interruptedHelper } from '@smarteverything/harness';
import { readNativeHistory } from '@smarteverything/harness/process';
import { harnessTargetKey } from '@smarteverything/domain';
import type { AiChatRow, AiHarnessTarget, DshSessionMetadata } from '@smarteverything/domain';
import { Logger, background, messageOf } from '@smarteverything/logging';
import type { Store } from '../../../store/store';
import type { HarnessService } from '../../../harness/service';
import { ensureNativeControlSession } from './session-control';

const log = new Logger('hub.assistant-engine');

function history(
  store: Store,
  metadata: DshSessionMetadata,
  profileId: string,
): ReturnType<typeof readNativeHistory> {
  return readNativeHistory(
    metadata.header,
    store.dshSessions.readAll(metadata.header.id, profileId),
  );
}

function interrupted(
  store: Store,
  parent: DshSessionMetadata,
  children: ReadonlyMap<string, DshSessionMetadata>,
  profileId: string,
): boolean {
  const events = history(store, parent, profileId);
  const delivered = deliveredIds(events);
  return catalogedHelpers(events).some((childId) => {
    const child = children.get(childId);
    return (
      child !== undefined &&
      interruptedHelper(childId, history(store, child, profileId), delivered) !== undefined
    );
  });
}

function parentsWithInterruptedHelpers(store: Store, profileId: string): ReadonlySet<string> {
  const sessions = store.dshSessions.list(profileId);
  const children = new Map(
    sessions
      .filter((session) => session.header.origin === 'subagent')
      .map((session) => [session.header.id, session]),
  );
  const parents = new Set(
    [...children.values()].flatMap((child) =>
      child.header.parentSession === undefined ? [] : [child.header.parentSession],
    ),
  );
  return new Set(
    sessions
      .filter(
        (session) =>
          parents.has(session.header.id) && interrupted(store, session, children, profileId),
      )
      .map((session) => session.header.id),
  );
}

export async function wakeInterruptedParents(
  service: HarnessService,
  target: AiHarnessTarget,
): Promise<void> {
  const key = harnessTargetKey(target);
  const chats = service.store.aiChats
    .usingEngine('dsh')
    .filter((chat) => harnessTargetKey(service.binding(chat).execution_target) === key);
  const parents = new Map<string, ReadonlySet<string>>();
  for (const chat of chats) {
    const sessionId = service.binding(chat).session_id;
    if (sessionId === null) continue;
    const interruptedParents =
      parents.get(chat.profile_id) ?? parentsWithInterruptedHelpers(service.store, chat.profile_id);
    parents.set(chat.profile_id, interruptedParents);
    if (interruptedParents.has(sessionId)) await reopen(service, chat, sessionId);
  }
}

async function reopen(service: HarnessService, chat: AiChatRow, sessionId: string): Promise<void> {
  try {
    await ensureNativeControlSession(service, chat);
    log.info('dsh.helpers_parent_reopened', { chatId: chat.id, sessionId });
  } catch (cause) {
    log.warn('dsh.helpers_parent_reopen_failed', {
      chatId: chat.id,
      sessionId,
      reason: messageOf(cause),
    });
  }
}

export function followInterruptedHelpers(service: HarnessService): void {
  for (const host of service.directory.list())
    if (host.online)
      background(wakeInterruptedParents(service, host.target), 'helpers.wake_failed');
  service.directory.onRegister((connection) => {
    background(wakeInterruptedParents(service, connection.host.target), 'helpers.wake_failed');
  });
}
