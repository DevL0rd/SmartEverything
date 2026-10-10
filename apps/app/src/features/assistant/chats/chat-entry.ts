import { localDayKey } from '../../../format/time';

export type ChatState = 'idle' | 'working' | 'failed';

export interface ChatEntry {
  readonly id: string;
  readonly title: string;
  readonly preview: string | null;
  readonly empty: boolean;
  readonly at: string;
  readonly pinned: boolean;
  readonly call: boolean;
  readonly worker: boolean;
  readonly nested: boolean;
  readonly state: ChatState;
}

export type ChatListItem =
  | { readonly type: 'header'; readonly key: string; readonly title: string }
  | { readonly type: 'chat'; readonly key: string; readonly entry: ChatEntry };

const DAY_MS = 86_400_000;

type Bucket = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Older';

const BUCKETS: readonly Bucket[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Older'];

function bucketOf(entry: ChatEntry, now: number, timeZone: string | null): Bucket {
  if (entry.pinned) {
    return 'Pinned';
  }
  const day = localDayKey(entry.at, timeZone);
  if (day === localDayKey(now, timeZone)) {
    return 'Today';
  }
  if (day === localDayKey(now - DAY_MS, timeZone)) {
    return 'Yesterday';
  }
  return now - Date.parse(entry.at) < 7 * DAY_MS ? 'Previous 7 days' : 'Older';
}

export interface ChatThreadGroup {
  readonly parent: ChatEntry;
  readonly children: readonly ChatEntry[];
}

export function listItemsOf(
  groups: readonly ChatThreadGroup[],
  now: number,
  timeZone: string | null,
): readonly ChatListItem[] {
  const sorted = [...groups].sort((left, right) => right.parent.at.localeCompare(left.parent.at));
  return BUCKETS.flatMap((bucket) => {
    const inBucket = sorted.filter((group) => bucketOf(group.parent, now, timeZone) === bucket);
    if (inBucket.length === 0) {
      return [];
    }
    return [
      { type: 'header' as const, key: `header-${bucket}`, title: bucket },
      ...inBucket.flatMap((group) =>
        [group.parent, ...group.children].map((entry) => ({
          type: 'chat' as const,
          key: entry.id,
          entry,
        })),
      ),
    ];
  });
}
