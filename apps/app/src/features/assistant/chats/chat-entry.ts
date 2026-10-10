import { DAY_MS, localDayKey } from '../../../format/time';
import { sameSource, type ChatSource } from '../model/chat-source';

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

export interface ChatEntry {
  readonly id: string;
  readonly title: string;
  readonly source: ChatSource;
  readonly at: string;
  readonly pinned: boolean;
  readonly archived: boolean;
  readonly unread: number;
  readonly parentId: string | null;
  readonly line: ChatLine;
}

export interface ChatRowItem {
  readonly entry: ChatEntry;
  readonly nested: boolean;
}

export interface ChatSection {
  readonly key: string;
  readonly title: string;
  readonly data: readonly ChatRowItem[];
}

type Bucket = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

const BUCKETS: readonly Bucket[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];

const WEEK_MS = 7 * DAY_MS;

function bucketOf(entry: ChatEntry, now: number, timeZone: string | null): Bucket {
  if (entry.pinned && !entry.archived) {
    return 'Pinned';
  }
  const day = localDayKey(entry.at, timeZone);
  if (day === localDayKey(now, timeZone)) {
    return 'Today';
  }
  if (day === localDayKey(now - DAY_MS, timeZone)) {
    return 'Yesterday';
  }
  return now - Date.parse(entry.at) < WEEK_MS ? 'Previous 7 days' : 'Older';
}

export function newestFirst(left: ChatEntry, right: ChatEntry): number {
  return right.at.localeCompare(left.at) || left.id.localeCompare(right.id);
}

interface Family {
  readonly parent: ChatEntry;
  readonly children: readonly ChatEntry[];
}

function familiesOf(entries: readonly ChatEntry[]): readonly Family[] {
  const known = new Set(entries.map((entry) => entry.id));
  const hasParent = (entry: ChatEntry): boolean =>
    entry.parentId !== null && known.has(entry.parentId);
  return entries
    .filter((entry) => !hasParent(entry))
    .sort(newestFirst)
    .map((parent) => ({
      parent,
      children: entries.filter((entry) => entry.parentId === parent.id).sort(newestFirst),
    }));
}

function rowsOf(family: Family): readonly ChatRowItem[] {
  return [
    { entry: family.parent, nested: false },
    ...family.children.map((entry) => ({ entry, nested: true })),
  ];
}

export function sectionsOf(
  entries: readonly ChatEntry[],
  now: number,
  timeZone: string | null,
): readonly ChatSection[] {
  const families = familiesOf(entries);
  return BUCKETS.flatMap((bucket) => {
    const inBucket = families.filter((family) => bucketOf(family.parent, now, timeZone) === bucket);
    return inBucket.length === 0
      ? []
      : [{ key: bucket, title: bucket, data: inBucket.flatMap(rowsOf) }];
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

export function sameEntry(left: ChatEntry, right: ChatEntry): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.at === right.at &&
    left.pinned === right.pinned &&
    left.archived === right.archived &&
    left.unread === right.unread &&
    left.parentId === right.parentId &&
    sameSource(left.source, right.source) &&
    lineKey(left.line) === lineKey(right.line)
  );
}
