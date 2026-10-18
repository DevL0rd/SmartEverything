import type { ComputerAiRuntime } from '@smarteverything/domain';
import { rootEntryOf, type ChatEntry } from './chat-entry';

type ChatGroupKey = 'chats' | ComputerAiRuntime;

interface GroupSpec {
  readonly key: ChatGroupKey;
  readonly title: string;
}

const MAIN_GROUP: GroupSpec = { key: 'chats', title: 'Chats' };

const RUNTIME_GROUPS: readonly (GroupSpec & {
  readonly key: ComputerAiRuntime;
  readonly emptyText: string;
})[] = [
  { key: 'claude', title: 'Claude', emptyText: 'No Claude chats yet.' },
  { key: 'codex', title: 'Codex', emptyText: 'No Codex chats yet.' },
];

export interface ChatGroup extends GroupSpec {
  readonly entries: readonly ChatEntry[];
  readonly emptyText: string | null;
}

function groupKeyOf(entry: ChatEntry, pool: ReadonlyMap<string, ChatEntry>): ChatGroupKey {
  const runtime = rootEntryOf(entry, pool)?.runtime ?? null;
  return RUNTIME_GROUPS.find((group) => group.key === runtime)?.key ?? MAIN_GROUP.key;
}

export function partitionChats(
  matched: readonly ChatEntry[],
  pool: readonly ChatEntry[],
  available: ReadonlySet<ComputerAiRuntime>,
): readonly ChatGroup[] {
  const index = new Map(pool.map((entry) => [entry.id, entry]));
  const keys = matched.map((entry) => groupKeyOf(entry, index));
  const main = {
    ...MAIN_GROUP,
    emptyText: null,
    entries: matched.filter((_, at) => keys[at] === MAIN_GROUP.key),
  };
  const runtimes = RUNTIME_GROUPS.map((group) => ({
    key: group.key,
    title: group.title,
    emptyText: group.emptyText,
    entries: matched.filter((_, at) => keys[at] === group.key),
  })).filter((group) => group.entries.length > 0 || available.has(group.key));
  return [main, ...runtimes];
}
