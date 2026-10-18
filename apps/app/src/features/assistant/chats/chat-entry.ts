import { appendTo } from '@smarteverything/domain';
import type { AiChatKind, ClaudeSession, ComputerAiRuntime } from '@smarteverything/domain';
import { DAY_MS, dayRelationOf } from '../../../format/time';
import { sameSource, type ChatSource } from '../model/chat-source';
import { compareText } from '../../../format/text';

export interface PreviewChatLine {
  readonly kind: 'preview';
  readonly speaker: string | null;
  readonly text: string;
}

export interface FailedChatLine {
  readonly kind: 'failed';
  readonly sent: boolean;
  readonly reason: string;
}

export type ChatLine =
  | { readonly kind: 'empty' }
  | { readonly kind: 'archived' }
  | PreviewChatLine
  | { readonly kind: 'working'; readonly step: string | null }
  | FailedChatLine;

export interface DesktopRef {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly session: ClaudeSession;
}

export interface ChatEntry {
  readonly id: string;
  readonly kind: AiChatKind;
  readonly title: string;
  readonly source: ChatSource;
  readonly at: string;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly unread: number;
  readonly requests: number;
  readonly parentId: string | null;
  readonly runtime: ComputerAiRuntime | null;
  readonly computerId: string | null;
  readonly line: ChatLine;
  readonly desktop?: DesktopRef;
}

export interface ChatFamily {
  readonly entry: ChatEntry;
  readonly agents: readonly ChatEntry[];
  readonly matchedAgents: boolean;
}

export interface ChatSection {
  readonly key: string;
  readonly title: string;
  readonly data: readonly ChatFamily[];
}

type Bucket = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

const BUCKETS: readonly Bucket[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];

const WEEK_MS = 7 * DAY_MS;

function bucketOf(entry: ChatEntry, now: number, timeZone: string | null): Bucket {
  if (entry.pinned && !entry.archived) {
    return 'Pinned';
  }
  const relation = dayRelationOf(entry.at, now, timeZone);
  if (relation === 'today') {
    return 'Today';
  }
  if (relation === 'yesterday') {
    return 'Yesterday';
  }
  return now - Date.parse(entry.at) < WEEK_MS ? 'Previous 7 days' : 'Older';
}

function newestFirst(left: ChatEntry, right: ChatEntry): number {
  return compareText(right.at, left.at) || compareText(left.id, right.id);
}

function runningFirst(left: ChatEntry, right: ChatEntry): number {
  const running = Number(right.line.kind === 'working') - Number(left.line.kind === 'working');
  return running || newestFirst(left, right);
}

function isAgent(entry: ChatEntry): boolean {
  return entry.kind === 'subagent';
}

type EntryIndex = ReadonlyMap<string, ChatEntry>;

export function rootEntryOf(entry: ChatEntry, index: EntryIndex): ChatEntry | null {
  let current: ChatEntry | undefined = entry;
  while (current !== undefined && isAgent(current)) {
    current = index.get(current.parentId ?? '');
  }
  return current ?? null;
}

function rootIdOf(entry: ChatEntry, index: EntryIndex): string | null {
  return rootEntryOf(entry, index)?.id ?? null;
}

function agentsByRoot(
  pool: readonly ChatEntry[],
  index: EntryIndex,
): ReadonlyMap<string, readonly ChatEntry[]> {
  const grouped = new Map<string, ChatEntry[]>();
  for (const entry of pool) {
    const root = isAgent(entry) ? rootIdOf(entry, index) : null;
    if (root !== null) {
      appendTo(grouped, root, entry);
    }
  }
  return new Map([...grouped].map(([root, agents]) => [root, agents.sort(runningFirst)]));
}

export function orphanAgentsOf(pool: readonly ChatEntry[]): readonly ChatEntry[] {
  const index: EntryIndex = new Map(pool.map((entry) => [entry.id, entry]));
  return pool
    .filter((entry) => isAgent(entry) && rootIdOf(entry, index) === null)
    .sort(newestFirst);
}

function rootsOf(
  matched: readonly ChatEntry[],
  index: EntryIndex,
  narrowed: boolean,
): ReadonlyMap<string, boolean> {
  const roots = new Map<string, boolean>();
  for (const entry of matched) {
    const root = rootIdOf(entry, index);
    if (root !== null) {
      roots.set(root, (roots.get(root) ?? false) || (narrowed && isAgent(entry)));
    }
  }
  return roots;
}

interface SectionsContext {
  readonly now: number;
  readonly timeZone: string | null;
  readonly narrowed?: boolean;
}

export function sectionsOf(
  matched: readonly ChatEntry[],
  pool: readonly ChatEntry[],
  { now, timeZone, narrowed = matched !== pool }: SectionsContext,
): readonly ChatSection[] {
  const index: EntryIndex = new Map(pool.map((entry) => [entry.id, entry]));
  const agents = agentsByRoot(pool, index);
  const roots = rootsOf(matched, index, narrowed);
  const families = pool
    .filter((entry) => roots.has(entry.id))
    .sort(newestFirst)
    .map((entry): ChatFamily => ({
      entry,
      agents: agents.get(entry.id) ?? [],
      matchedAgents: roots.get(entry.id) ?? false,
    }));
  const bucketed = new Map<Bucket, ChatFamily[]>();
  for (const family of families) {
    appendTo(bucketed, bucketOf(family.entry, now, timeZone), family);
  }
  return BUCKETS.flatMap((bucket) => {
    const data = bucketed.get(bucket) ?? [];
    return data.length === 0 ? [] : [{ key: bucket, title: bucket, data }];
  });
}

function lineKey(line: ChatLine): string {
  switch (line.kind) {
    case 'preview':
      return `preview|${line.speaker ?? ''}|${line.text}`;
    case 'working':
      return `working|${line.step ?? ''}`;
    case 'failed':
      return `failed|${String(line.sent)}|${line.reason}`;
    case 'empty':
    case 'archived':
      return line.kind;
  }
}

const ENTRY_KEYS = [
  'id',
  'kind',
  'title',
  'at',
  'pinned',
  'archived',
  'unread',
  'requests',
  'parentId',
  'runtime',
  'computerId',
] as const;

export function sameEntry(left: ChatEntry, right: ChatEntry): boolean {
  return (
    ENTRY_KEYS.every((key) => left[key] === right[key]) &&
    sameSource(left.source, right.source) &&
    lineKey(left.line) === lineKey(right.line)
  );
}
