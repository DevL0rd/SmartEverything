import { z } from 'zod';
import type { ChatEntry } from './chat-entry';
import type { ChatSourceKind } from '../model/chat-source';

const CHAT_FILTER_PARAM = z.enum(['unread', 'needs', 'pinned', 'archived']);

export type ChatFilter =
  'all' | 'unread' | 'needs' | 'running' | 'pinned' | 'archived' | `source:${string}`;

export interface SourceOption {
  readonly filter: ChatFilter;
  readonly label: string;
  readonly kind: ChatSourceKind;
  readonly pluginId: string | null;
}

export interface FilterCounts {
  readonly unread: number;
  readonly needs: number;
  readonly running: number;
  readonly sources: readonly SourceOption[];
}

export function filterOfParam(value: string | undefined): ChatFilter {
  const parsed = CHAT_FILTER_PARAM.safeParse(value);
  return parsed.success ? parsed.data : 'all';
}

export function countsOf(entries: readonly ChatEntry[]): FilterCounts {
  const seen = new Map<string, SourceOption>();
  for (const entry of entries) {
    const { source } = entry;
    if (source.filterKey !== null && !seen.has(source.filterKey)) {
      seen.set(source.filterKey, {
        filter: `source:${source.filterKey}`,
        label: source.label,
        kind: source.kind,
        pluginId: source.pluginId,
      });
    }
  }
  return {
    unread: entries.filter((entry) => entry.unread > 0).length,
    needs: entries.filter((entry) => entry.requests > 0).length,
    running: entries.filter((entry) => entry.line.kind === 'working').length,
    sources: [...seen.values()],
  };
}

export function applyFilter(
  entries: readonly ChatEntry[],
  filter: ChatFilter,
): readonly ChatEntry[] {
  switch (filter) {
    case 'all':
    case 'archived':
      return entries;
    case 'unread':
      return entries.filter((entry) => entry.unread > 0);
    case 'needs':
      return entries.filter((entry) => entry.requests > 0);
    case 'running':
      return entries.filter((entry) => entry.line.kind === 'working');
    case 'pinned':
      return entries.filter((entry) => entry.pinned);
    default:
      return entries.filter((entry) => `source:${entry.source.filterKey ?? ''}` === filter);
  }
}

export function emptyTitleOf(filter: ChatFilter): string {
  switch (filter) {
    case 'unread':
      return 'No unread chats';
    case 'needs':
      return 'Nothing needs you';
    case 'running':
      return 'Nothing running';
    case 'pinned':
      return 'No pinned chats';
    case 'archived':
      return 'No archived chats';
    case 'all':
    default:
      return 'No chats here';
  }
}

export function withoutPending(
  entries: readonly ChatEntry[],
  pending: ReadonlySet<string>,
): readonly ChatEntry[] {
  if (pending.size === 0) {
    return entries;
  }
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const gone = (entry: ChatEntry): boolean => {
    for (let at = entry; ;) {
      if (pending.has(at.id)) {
        return true;
      }
      const parent = byId.get(at.parentId ?? '');
      if (parent === undefined) {
        return false;
      }
      at = parent;
    }
  };
  return entries.filter((entry) => !gone(entry));
}
