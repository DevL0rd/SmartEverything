import { catalogedHelpers, deliveredIds, interruptedHelper } from '@smarteverything/harness';
import { readNativeHistory } from '@smarteverything/harness/process';
import { harnessTargetKey } from '@smarteverything/domain';
import type { AiChatRow, AiHarnessTarget, DshSessionMetadata } from '@smarteverything/domain';
import { Logger, background, messageOf } from '@smarteverything/logging';
import type { Store } from '../../../store/store';
import type { HarnessService } from '../../../harness/service';
import { ensureNativeControlSession } from './session-control';

const log = new Logger('hub.assistant-engine');

async function history(
  store: Pick<Store, 'host'>,
  metadata: DshSessionMetadata,
  profileId: string,
): Promise<ReturnType<typeof readNativeHistory>> {
  return readNativeHistory(
    metadata.header,
    await store.host.call('dshSessions', 'readAll', metadata.header.id, profileId),
  );
}

async function interrupted(
  store: Pick<Store, 'host'>,
  parent: DshSessionMetadata,
  children: ReadonlyMap<string, DshSessionMetadata>,
  profileId: string,
): Promise<boolean> {
  const events = await history(store, parent, profileId);
  const delivered = deliveredIds(events);
  for (const childId of catalogedHelpers(events)) {
    const child = children.get(childId);
    if (
      child !== undefined &&
      interruptedHelper(childId, await history(store, child, profileId), delivered) !== undefined
    )
      return true;
  }
  return false;
}

async function parentsWithInterruptedHelpers(
  store: Pick<Store, 'host'>,
  profileId: string,
): Promise<ReadonlySet<string>> {
  const sessions = await store.host.call('dshSessions', 'list', profileId);
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
  const found = new Set<string>();
  for (const session of sessions)
    if (parents.has(session.header.id) && (await interrupted(store, session, children, profileId)))
      found.add(session.header.id);
  return found;
}

export async function wakeInterruptedParents(
  service: HarnessService,
  target: AiHarnessTarget,
): Promise<void> {
  const key = harnessTargetKey(target);
  const chats = (await service.store.host.call('aiChats', 'usingEngine', 'dsh')).filter(
    (chat) => harnessTargetKey(service.binding(chat).execution_target) === key,
  );
  const parents = new Map<string, ReadonlySet<string>>();
  for (const chat of chats) {
    const sessionId = service.binding(chat).session_id;
    if (sessionId === null) continue;
    const interruptedParents =
      parents.get(chat.profile_id) ??
      (await parentsWithInterruptedHelpers(service.store, chat.profile_id));
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
