import type { AiChatRow } from '@smarteverything/domain';
import { isComputerEngine } from '../provider/computer-engine';
import { rootEntryOf, type ChatEntry } from './chat-entry';

function visibleInApp(entry: ChatEntry, index: ReadonlyMap<string, ChatEntry>): boolean {
  const root = rootEntryOf(entry, index);
  return (root?.runtime ?? null) === null || root?.nativeAdmission === 'standalone';
}

export function visibleAppChats(entries: readonly ChatEntry[]): readonly ChatEntry[] {
  const index = new Map(entries.map((entry) => [entry.id, entry]));
  return entries.filter((entry) => visibleInApp(entry, index));
}

export function hiddenChatIds(
  live: readonly ChatEntry[],
  archived: readonly ChatEntry[],
): ReadonlySet<string> {
  const index = new Map([...live, ...archived].map((entry) => [entry.id, entry]));
  return new Set(
    [...index.values()].filter((entry) => !visibleInApp(entry, index)).map((entry) => entry.id),
  );
}

export function appChatHistoryOnly(
  chat: Pick<AiChatRow, 'kind' | 'engine' | 'native_admission'>,
): boolean {
  return (
    chat.kind !== 'subagent' &&
    isComputerEngine(chat.engine) &&
    chat.native_admission !== 'standalone'
  );
}
