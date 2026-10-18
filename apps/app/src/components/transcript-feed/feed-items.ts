import type { TranscriptHit, TranscriptSession } from '@smarteverything/domain';
import { localDayKey, longDate } from '../../format/time';

export type FeedItem =
  | { readonly kind: 'day'; readonly key: string; readonly label: string }
  | { readonly kind: 'session'; readonly key: string; readonly session: TranscriptSession }
  | { readonly kind: 'line'; readonly key: string; readonly hit: TranscriptHit };

export interface FeedLayout {
  readonly timeZone: string;
  readonly grouped: boolean;
}

export function feedItems(rows: readonly TranscriptHit[], layout: FeedLayout): FeedItem[] {
  const items: FeedItem[] = [];
  let day: string | null = null;
  let session: string | null = null;
  for (const hit of rows) {
    const dayKey = localDayKey(hit.line.at, layout.timeZone);
    if (dayKey !== day) {
      day = dayKey;
      session = null;
      items.push({
        kind: 'day',
        key: `day:${dayKey}`,
        label: longDate(hit.line.at, layout.timeZone),
      });
    }
    if (layout.grouped && hit.session.id !== session) {
      session = hit.session.id;
      items.push({ kind: 'session', key: `session:${session}:${dayKey}`, session: hit.session });
    }
    items.push({ kind: 'line', key: `line:${String(hit.line.id)}`, hit });
  }
  return items;
}

export function sessionRemovable(session: TranscriptSession): boolean {
  return session.source === 'camera' || session.ended_at !== null;
}
